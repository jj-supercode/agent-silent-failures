import { describe, expect, test } from 'vitest';

import { toRunView } from '../../trace/index.ts';
import type { RunView } from '../../trace/model.ts';
import {
    sampleAgentRunSpans,
    sampleRetrievalTools,
    type AgentRunSample,
    type ToolCallSample,
} from '../../trace/testing.ts';
import { createSwallowedToolErrorDetector } from './detector.ts';
import { defineSwallowedToolErrorEntry } from './entry.ts';
import { swallowedToolErrorThresholds } from './model.ts';

const confidentAnswer = 'Ed Wood was born in 1924 [S1].';
const abstention = 'I could not find an answer in the corpus.';

const succeeded: ToolCallSample = {
    toolName: 'searchCorpus',
    args: { query: 'Ed Wood' },
    result: { returned: { hits: [] } },
};
const errorResult = (payload: unknown): ToolCallSample => ({
    toolName: 'searchCorpus',
    args: { query: 'Ed Wood' },
    result: { returned: payload },
});
const upstreamError = errorResult({ error: 'upstream 503' });
const thrown: ToolCallSample = { toolName: 'searchCorpus', args: { query: 'Ed Wood' }, result: { threw: 'timeout' } };

const viewOf = (run: AgentRunSample): RunView => {
    const built = toRunView(sampleAgentRunSpans(run), { retrievalTools: sampleRetrievalTools() });
    if (built.kind !== 'run') {
        throw new Error(built.reason);
    }
    return built.view;
};

const agentAnswering = (outputText: string, steps: AgentRunSample['steps']): RunView =>
    viewOf({ agentId: 'rag-agent', outputText, steps });

const detect = (view: RunView) => createSwallowedToolErrorDetector([])(view, swallowedToolErrorThresholds);

describe('detectSwallowedToolError fires', () => {
    test.each([
        ['an error field', { error: 'upstream 503' }],
        ['MCP isError', { isError: true, content: [{ type: 'text', text: 'rate limited' }] }],
        ['success false with a message', { success: false, message: 'quota exceeded' }],
        ['an error object with a message', { error: { code: 429, message: 'rate limited' } }],
        ["Mastra's output-schema failure", { error: true, message: 'output validation failed' }],
    ])('on %s answered confidently', (_, payload) => {
        expect(detect(agentAnswering(confidentAnswer, [errorResult(payload)])).kind).toBe('fired');
    });

    test('on a thrown call answered confidently', () => {
        const verdict = detect(agentAnswering(confidentAnswer, [thrown]));
        expect(verdict.kind === 'fired' && verdict.evidence.summary).toBe(
            'rag-agent answered without acknowledging a failed call to searchCorpus that it never retried successfully',
        );
    });

    test('when only a later refinement failed', () => {
        const verdict = detect(agentAnswering(confidentAnswer, [succeeded, upstreamError]));
        expect(verdict).toMatchObject({ kind: 'fired', severity: 0.5 });
    });

    test('on a worker that swallowed an error even when its supervisor answers', () => {
        const worker = { agentId: 'researcher', outputText: confidentAnswer, steps: [upstreamError] };
        const view = viewOf({
            agentId: 'supervisor',
            outputText: confidentAnswer,
            steps: [{ workerName: 'researcher', prompt: 'Research Ed Wood.', worker }],
        });
        expect(detect(view).kind).toBe('fired');
    });
});

describe('detectSwallowedToolError stays clear', () => {
    test('saying that nothing failed when no call failed', () => {
        expect(detect(agentAnswering(confidentAnswer, [succeeded]))).toEqual({
            kind: 'clear',
            evidence: { summary: 'no tool call failed (1 made)' },
        });
    });

    test('on a transient error followed by a successful retry', () => {
        expect(detect(agentAnswering(confidentAnswer, [upstreamError, succeeded])).kind).toBe('clear');
    });

    test('when the agent abstains after the error', () => {
        expect(detect(agentAnswering(abstention, [upstreamError, upstreamError])).kind).toBe('clear');
    });

    test('when the answer admits the failure', () => {
        expect(detect(agentAnswering('The search tool failed, so I cannot say.', [upstreamError])).kind).toBe('clear');
    });

    test('when the agent gave no answer at all', () => {
        expect(detect(agentAnswering('', [upstreamError])).kind).toBe('clear');
    });

    test('on results that merely contain an empty error field', () => {
        expect(detect(agentAnswering(confidentAnswer, [errorResult({ hits: [], error: null })])).kind).toBe('clear');
    });

    test.each([
        ['a business refusal', { success: false, reason: 'already booked', nextFree: '2026-11-02' }],
        ['an error object that names no failure', { error: { code: 0 } }],
        ['an error flag set to false', { error: false, rows: [] }],
    ])('on %s the agent relays', (_, payload) => {
        expect(
            detect(agentAnswering('The room is taken; the next free day is 2 November.', [errorResult(payload)])).kind,
        ).toBe('clear');
    });

    test("when the answer admits the failure in the agent's own words, declared as an extra pattern", () => {
        const ownWording = { name: 'catalogue offline', pattern: /\bcatalogue is offline\b/ };
        const entry = defineSwallowedToolErrorEntry({ extraAcknowledgementPatterns: [ownWording] });
        const view = agentAnswering('Our catalogue is offline right now; please try later.', [upstreamError]);
        expect(detect(view).kind).toBe('fired');
        expect(entry.detect(view).kind).toBe('clear');
    });
});

describe('detectSwallowedToolError is not applicable', () => {
    test('to a run without tool calls', () => {
        expect(detect(agentAnswering(confidentAnswer, [])).kind).toBe('not-applicable');
    });
});
