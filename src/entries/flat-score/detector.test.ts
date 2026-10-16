import { describe, expect, test } from 'vitest';

import {
    descendingScore,
    sampleAgentRunSpans,
    sampleHits,
    sampleRetrievalToolName,
    sampleRetrievalTools,
    type ToolCallSample,
} from '../../trace/testing.ts';
import { toRunView, type RetrievalHit, type RunView } from '../../trace/index.ts';
import { detectFlatScore } from './detector.ts';
import { flatScoreThresholds } from './model.ts';

const topK = 5;
const constantScore = 0.5;
const belowNoise = flatScoreThresholds.MAX_FLAT_SPREAD.value / 10;

const search = (hits: readonly RetrievalHit[]): ToolCallSample => ({
    toolName: sampleRetrievalToolName,
    args: { query: 'who wrote it' },
    result: { returned: { hits } },
});

const runView = (steps: readonly ToolCallSample[]): RunView => {
    const mapped = toRunView(sampleAgentRunSpans({ agentId: 'rag-agent', outputText: 'An answer [S1].', steps }), {
        retrievalTools: sampleRetrievalTools(),
    });
    if (mapped.kind !== 'run') {
        throw new Error(mapped.reason);
    }
    return mapped.view;
};

const detect = (steps: readonly ToolCallSample[]) => detectFlatScore(runView(steps), flatScoreThresholds);

describe('flat-score detector', () => {
    test('is clear when the rows carry a descending score ladder', () => {
        expect(detect([search(sampleHits(topK, descendingScore))]).kind).toBe('clear');
    });

    test('fires with full severity when every row has the same score', () => {
        expect(detect([search(sampleHits(topK, () => constantScore))])).toMatchObject({ kind: 'fired', severity: 1 });
    });

    test('fires when scores differ only below float noise', () => {
        expect(detect([search(sampleHits(topK, (rank) => constantScore + rank * belowNoise))]).kind).toBe('fired');
    });

    test('fires when any score is NaN, even if the rest are spread', () => {
        const hits = sampleHits(topK, (rank) => (rank === 0 ? Number.NaN : descendingScore(rank)));
        expect(detect([search(hits)]).kind).toBe('fired');
    });

    test('severity is the share of judged retrievals that were flat, and evidence names only those', () => {
        const verdict = detect([search(sampleHits(topK, descendingScore)), search(sampleHits(topK, () => 0))]);
        expect(verdict).toMatchObject({ kind: 'fired', severity: 0.5 });
        expect(verdict.kind === 'fired' ? verdict.evidence.spanIds : []).toHaveLength(1);
    });

    test('a duplicated pair inside a spread list is not flat (hard negative)', () => {
        const hits = sampleHits(topK, (rank) => descendingScore(Math.max(0, rank - 1)));
        expect(detect([search(hits)]).kind).toBe('clear');
    });

    test('two tied rows are too few to judge: not applicable', () => {
        const minimumMinusOne = flatScoreThresholds.MIN_HITS.value - 1;
        expect(detect([search(sampleHits(minimumMinusOne, () => constantScore))]).kind).toBe('not-applicable');
    });

    test('a run without retrievals, or with only empty ones, is not applicable', () => {
        expect(detect([]).kind).toBe('not-applicable');
        expect(detect([search([])]).kind).toBe('not-applicable');
    });

    test('an empty row list is never judged flat, even with MIN_HITS swept to 0', () => {
        const sweptToZero = { ...flatScoreThresholds, MIN_HITS: { ...flatScoreThresholds.MIN_HITS, value: 0 } };
        expect(detectFlatScore(runView([search([])]), sweptToZero).kind).toBe('not-applicable');
    });

    test('an error payload from the retrieval tool is not judged', () => {
        const failed: ToolCallSample = { ...search([]), result: { returned: { error: 'upstream 503' } } };
        expect(detect([failed]).kind).toBe('not-applicable');
    });

    test('mentions rows cut off by the span array cap in its evidence', () => {
        const cutRows = 10;
        const verdict = detect([
            {
                ...search([]),
                result: { returned: { hits: [...sampleHits(topK, descendingScore), `[…${cutRows} more items]`] } },
            },
        ]);
        expect(verdict.kind === 'clear' ? verdict.evidence.summary : '').toContain(
            `${cutRows} rows past the span array cap`,
        );
    });

    describe('evidence wording', () => {
        const flatSearch = search(sampleHits(topK, () => constantScore));
        const nanSearch = search(sampleHits(topK, () => Number.NaN));
        const summaryOf = (steps: readonly ToolCallSample[]): string => {
            const verdict = detect(steps);
            return verdict.kind === 'fired' ? verdict.evidence.summary : '';
        };

        test('names the shape of a single flat retrieval once', () => {
            expect(summaryOf([flatSearch])).toBe(
                'the only retrieval returned rows with no ranking signal (score spread 0.00)',
            );
        });

        test('says a shape once with "in all N" when every flat retrieval reads the same', () => {
            expect(summaryOf([flatSearch, flatSearch, flatSearch, flatSearch])).toContain(
                '(score spread 0.00 in all 4)',
            );
        });

        test('counts each distinct shape when they differ', () => {
            expect(summaryOf([flatSearch, flatSearch, nanSearch])).toContain(
                '(score spread 0.00 in 2, non-finite scores in 1)',
            );
        });

        test('lists distinct shapes plainly when none repeats', () => {
            expect(summaryOf([flatSearch, nanSearch])).toContain('(score spread 0.00, non-finite scores)');
        });
    });
});
