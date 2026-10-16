import { describe, expect, test } from 'vitest';

import { toRunView, type RunView } from '../../trace/index.ts';
import {
    descendingScore,
    sampleAgentRunSpans,
    sampleHits,
    sampleRetrievalToolName,
    sampleRetrievalTools,
    type ToolCallSample,
} from '../../trace/testing.ts';
import { createEmptyRetrievalAnsweredDetector } from './detector.ts';
import { emptyRetrievalAnsweredThresholds } from './model.ts';

const topK = 5;
const confidentAnswer = 'The film was directed by Christopher Nolan [S1].';
const contractAbstention = 'I could not find an answer in the corpus.';
const ownDecliningSentence = 'Nothing on file for that.';

const emptySearch: ToolCallSample = {
    toolName: sampleRetrievalToolName,
    args: { query: 'who directed it' },
    result: { returned: { hits: [] } },
};
const foundSearch: ToolCallSample = {
    ...emptySearch,
    result: { returned: { hits: sampleHits(topK, descendingScore) } },
};
const failedSearch: ToolCallSample = { ...emptySearch, result: { threw: 'connection reset' } };

const runView = (outputText: string, steps: readonly ToolCallSample[]): RunView => {
    const mapped = toRunView(sampleAgentRunSpans({ agentId: 'rag-agent', outputText, steps }), {
        retrievalTools: sampleRetrievalTools(),
    });
    if (mapped.kind !== 'run') {
        throw new Error(mapped.reason);
    }
    return mapped.view;
};

const detect = createEmptyRetrievalAnsweredDetector([]);
const verdictKind = (outputText: string, steps: readonly ToolCallSample[]) =>
    detect(runView(outputText, steps), emptyRetrievalAnsweredThresholds).kind;

describe('empty-retrieval-answered detector', () => {
    test('fires when the only retrieval came back empty and the agent answered with a citation', () => {
        const verdict = detect(runView(confidentAnswer, [emptySearch]), emptyRetrievalAnsweredThresholds);
        expect(verdict).toMatchObject({ kind: 'fired', severity: 1 });
        expect(verdict.kind === 'fired' ? verdict.evidence.spanIds : []).toHaveLength(2);
    });

    test('quotes a long answer up to a cut marked with an ellipsis', () => {
        const longAnswer = `${confidentAnswer} ${'He later produced several more films in the same studio. '.repeat(4)}`;
        const verdict = detect(runView(longAnswer, [emptySearch]), emptyRetrievalAnsweredThresholds);
        const summary = verdict.kind === 'fired' ? verdict.evidence.summary : '';
        expect(summary.endsWith('…"')).toBe(true);
        expect(summary).toContain(`"${confidentAnswer}`);
    });

    test('fires when every one of several retrievals came back empty', () => {
        expect(verdictKind(confidentAnswer, [emptySearch, emptySearch])).toBe('fired');
    });

    test('is clear when the agent abstains after an empty retrieval (hard negative)', () => {
        expect(verdictKind(contractAbstention, [emptySearch])).toBe('clear');
    });

    test('is clear when a later retrieval found rows (search, then refine)', () => {
        expect(verdictKind(confidentAnswer, [emptySearch, foundSearch])).toBe('clear');
    });

    test('is clear when the agent gave no answer at all', () => {
        expect(verdictKind('  ', [emptySearch])).toBe('clear');
    });

    test('counts an empty row list among failed calls, and ignores the failed ones', () => {
        expect(verdictKind(confidentAnswer, [failedSearch, emptySearch])).toBe('fired');
    });

    test('is not applicable without retrieval calls, or when no call returned a row list', () => {
        expect(verdictKind(confidentAnswer, [])).toBe('not-applicable');
        expect(verdictKind(confidentAnswer, [failedSearch])).toBe('not-applicable');
    });

    test("honours an agent's own declining sentence passed as an extra pattern", () => {
        const withOwnPhrase = createEmptyRetrievalAnsweredDetector([
            { name: 'nothing-on-file', pattern: /nothing on file/ },
        ]);
        expect(withOwnPhrase(runView(ownDecliningSentence, [emptySearch]), emptyRetrievalAnsweredThresholds).kind).toBe(
            'clear',
        );
        expect(verdictKind(ownDecliningSentence, [emptySearch])).toBe('fired');
    });

    test('zero rows still count as empty with MAX_HITS_FOR_EMPTY swept below zero', () => {
        const swept = { MAX_HITS_FOR_EMPTY: { ...emptyRetrievalAnsweredThresholds.MAX_HITS_FOR_EMPTY, value: -1 } };
        expect(detect(runView(confidentAnswer, [emptySearch]), swept).kind).toBe('fired');
    });

    test('a raised MAX_HITS_FOR_EMPTY treats a thin retrieval as empty', () => {
        const thinSearch: ToolCallSample = {
            ...emptySearch,
            result: { returned: { hits: sampleHits(1, descendingScore) } },
        };
        const raised = { MAX_HITS_FOR_EMPTY: { ...emptyRetrievalAnsweredThresholds.MAX_HITS_FOR_EMPTY, value: 1 } };
        expect(detect(runView(confidentAnswer, [thinSearch]), raised).kind).toBe('fired');
        expect(verdictKind(confidentAnswer, [thinSearch])).toBe('clear');
    });
});
