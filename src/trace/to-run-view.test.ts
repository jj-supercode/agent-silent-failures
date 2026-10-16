import { describe, expect, test } from 'vitest';

import {
    descendingScore,
    sampleAgentRunSpans,
    sampleHits,
    sampleRetrievalToolName,
    sampleRetrievalTools,
    sampleSpan,
    sampleWorkflowSpans,
    type AgentRunSample,
} from './testing.ts';
import { toRunView, toRunViews, type RunViewResult } from './to-run-view.ts';

const retrievalToolName = sampleRetrievalToolName;
const options = { retrievalTools: sampleRetrievalTools() };
const hitCount = 4;
const declaredMaxSteps = 10;

const search = (query: string, returned: unknown) => ({
    toolName: retrievalToolName,
    args: { query },
    result: { returned },
});

const singleAgent: AgentRunSample = {
    agentId: 'rag-agent',
    outputText: 'Answer [S1]',
    maxSteps: declaredMaxSteps,
    steps: [
        search('first', { hits: sampleHits(hitCount, descendingScore) }),
        { toolName: 'clock', args: {}, result: { returned: 'noon' } },
    ],
};

const supervisor: AgentRunSample = {
    agentId: 'supervisor',
    outputText: 'Final answer',
    steps: [
        {
            workerName: 'researcher',
            prompt: 'find the founding year',
            worker: {
                agentId: 'researcher',
                outputText: 'It was 1854.',
                steps: [search('founding year', { hits: [] })],
            },
        },
    ],
};

const viewOf = (result: RunViewResult) => {
    if (result.kind !== 'run') {
        throw new Error(`expected a run view, got: ${result.reason}`);
    }
    return result.view;
};

describe('toRunView', () => {
    test('maps the root agent run with its answer text and declared step budget', () => {
        const view = viewOf(toRunView(sampleAgentRunSpans(singleAgent), options));
        expect(view.rootAgentRun).toMatchObject({
            agentId: 'rag-agent',
            outputText: 'Answer [S1]',
            maxSteps: declaredMaxSteps,
            parentAgentRunSpanId: null,
        });
    });

    test('lists every tool call in start order and decodes only declared retrieval tools', () => {
        const view = viewOf(toRunView(sampleAgentRunSpans(singleAgent), options));
        expect(view.toolCalls.map((call) => call.toolName)).toEqual([retrievalToolName, 'clock']);
        expect(view.retrievals).toHaveLength(1);
        expect(view.retrievals[0]?.retrieved).toEqual({
            kind: 'rows',
            hits: sampleHits(hitCount, descendingScore),
            truncatedItems: 0,
        });
    });

    test('attributes a worker call to the worker run, never to the supervisor', () => {
        const view = viewOf(toRunView(sampleAgentRunSpans(supervisor), options));
        const workerRun = view.agentRuns.find((run) => run.agentId === 'researcher');
        expect(workerRun?.parentAgentRunSpanId).toBe(view.rootAgentRun.spanId);
        expect(view.retrievals[0]?.ownerAgentRunSpanId).toBe(workerRun?.spanId);
    });

    test('maps a delegation to its worker name, prompt, worker run and reply', () => {
        const view = viewOf(toRunView(sampleAgentRunSpans(supervisor), options));
        const workerRun = view.agentRuns.find((run) => run.agentId === 'researcher');
        expect(view.delegations).toEqual([
            expect.objectContaining({
                workerName: 'researcher',
                prompt: 'find the founding year',
                workerRunSpanId: workerRun?.spanId,
                ownerAgentRunSpanId: view.rootAgentRun.spanId,
                reply: {
                    kind: 'replied',
                    text: 'It was 1854.',
                    toolResults: [
                        { toolName: retrievalToolName, args: { query: 'founding year' }, result: { hits: [] } },
                    ],
                },
            }),
        ]);
    });

    test('an ordinary tool whose name starts with agent- is not a delegation', () => {
        const run: AgentRunSample = {
            ...singleAgent,
            steps: [{ toolName: 'agent-status', args: {}, result: { returned: { status: 'ok' } } }],
        };
        const view = viewOf(toRunView(sampleAgentRunSpans(run), options));
        expect(view.toolCalls.map((call) => call.toolName)).toEqual(['agent-status']);
        expect(view.delegations).toEqual([]);
    });

    test('records a thrown tool as threw, and its retrieval as not-rows', () => {
        const run: AgentRunSample = {
            ...singleAgent,
            steps: [{ toolName: retrievalToolName, args: { query: 'q' }, result: { threw: 'connection reset' } }],
        };
        const view = viewOf(toRunView(sampleAgentRunSpans(run), options));
        expect(view.toolCalls[0]?.outcome).toEqual({ kind: 'threw', message: 'connection reset' });
        expect(view.retrievals[0]?.retrieved).toEqual({ kind: 'not-rows' });
    });

    test('keeps a thrown string error as its own message, without JSON quotes', () => {
        const [root, ...rest] = sampleAgentRunSpans(singleAgent);
        const spans = [
            ...(root === undefined ? [] : [root]),
            ...rest.map((span) =>
                span.spanType === 'tool_call' ? { ...span, output: undefined, error: 'boom' } : span,
            ),
        ];
        expect(viewOf(toRunView(spans, options)).toolCalls[0]?.outcome).toEqual({ kind: 'threw', message: 'boom' });
    });

    test('keeps an error payload as a returned value, so detectors can judge it', () => {
        const run: AgentRunSample = { ...singleAgent, steps: [search('q', { error: 'upstream 503' })] };
        const view = viewOf(toRunView(sampleAgentRunSpans(run), options));
        expect(view.toolCalls[0]?.outcome).toEqual({ kind: 'returned', value: { error: 'upstream 503' } });
        expect(view.retrievals[0]?.retrieved).toEqual({ kind: 'not-rows' });
    });

    test('orders tool calls by start time, not by storage order', () => {
        const spans = sampleAgentRunSpans(singleAgent);
        const view = viewOf(toRunView(spans.toReversed(), options));
        expect(view.toolCalls.map((call) => call.toolName)).toEqual([retrievalToolName, 'clock']);
    });

    test('refuses a workflow trace that ran no agent', () => {
        const spans = [
            sampleSpan({
                spanId: 'root',
                startOffset: 0,
                parentSpanId: null,
                name: 'w',
                spanType: 'workflow_run',
                entityId: null,
            }),
        ];
        expect(toRunView(spans, options)).toEqual({
            kind: 'not-a-run',
            reason: 'the workflow_run root ran no agent',
        });
    });

    test('maps an agent called from a workflow step, as Mastra 1.77 nests it under the workflow_run root', () => {
        const view = viewOf(toRunView(sampleWorkflowSpans('answer-question', [singleAgent]), options));
        expect(view.rootAgentRun).toMatchObject({ agentId: 'rag-agent', parentAgentRunSpanId: null });
        expect(view.toolCalls.map((call) => call.toolName)).toEqual([retrievalToolName, 'clock']);
        expect(view.retrievals).toHaveLength(1);
    });

    test('keeps a workflow supervisor and its worker in one view, the worker owning its own calls', () => {
        const view = viewOf(toRunView(sampleWorkflowSpans('research', [supervisor]), options));
        expect(view.agentRuns.map((run) => run.agentId)).toEqual(['supervisor', 'researcher']);
        expect(view.delegations).toHaveLength(1);
        expect(view.toolCalls.filter((call) => call.ownerAgentRunSpanId === view.agentRuns[1]?.spanId)).toHaveLength(1);
    });

    test('refuses a workflow with two top-level agents as one run, and maps each with toRunViews', () => {
        const spans = sampleWorkflowSpans('two-steps', [singleAgent, supervisor]);
        expect(toRunView(spans, options)).toEqual({
            kind: 'not-a-run',
            reason: 'the trace ran 2 agents at top level; use toRunViews',
        });
        const mapped = toRunViews(spans, options);
        expect(mapped.kind === 'runs' && mapped.views.map((view) => view.rootAgentRun.agentId)).toEqual([
            'rag-agent',
            'supervisor',
        ]);
        expect(mapped.kind === 'runs' && mapped.views.map((view) => view.toolCalls.length)).toEqual([2, 2]);
    });

    test('refuses a trace with two roots', () => {
        const spans = [
            ...sampleAgentRunSpans(singleAgent),
            sampleSpan({
                spanId: 'second-root',
                startOffset: 0,
                parentSpanId: null,
                name: 'x',
                spanType: 'agent_run',
                entityId: 'x',
            }),
        ];
        expect(toRunView(spans, options).kind).toBe('not-a-run');
    });

    test('refuses a cut trace instead of guessing who owns its orphaned spans', () => {
        const [root, , ...rest] = sampleAgentRunSpans(singleAgent);
        const spans = root === undefined ? rest : [root, ...rest];
        const result = toRunView(spans, options);
        expect(result.kind === 'not-a-run' && result.reason).toContain('missing from the trace');
    });

    test('refuses an empty trace', () => {
        expect(toRunView([], options).kind).toBe('not-a-run');
    });
});
