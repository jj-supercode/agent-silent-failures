import { retrievalsAmong } from '../../text/count-phrases.ts';
import { unitIntervalSchema, type RetrievalHit, type RunView, type SpanId } from '../../trace/model.ts';
import type { Detector, FlatScoreThresholds } from './model.ts';

type JudgedRetrieval = {
    readonly spanId: SpanId;
    readonly hits: readonly RetrievalHit[];
    readonly truncatedItems: number;
};

type ScoreShape = { readonly kind: 'non-finite' } | { readonly kind: 'finite'; readonly spread: number };

const scoreShape = (hits: readonly RetrievalHit[]): ScoreShape => {
    const scores = hits.map((hit) => hit.score);
    return scores.every(Number.isFinite)
        ? { kind: 'finite', spread: Math.max(...scores) - Math.min(...scores) }
        : { kind: 'non-finite' };
};

const isFlat = (shape: ScoreShape, maxFlatSpread: number): boolean =>
    shape.kind === 'non-finite' || shape.spread <= maxFlatSpread;

const retrievalCount = (count: number): string => `${count} ${count === 1 ? 'retrieval' : 'retrievals'}`;

const describeShape = (shape: ScoreShape): string =>
    shape.kind === 'non-finite' ? 'non-finite scores' : `score spread ${shape.spread.toPrecision(3)}`;

/**
 * The shapes of the flat retrievals, each distinct shape once: `score spread 0.00` for one retrieval,
 * `score spread 0.00 in all 4` when every one reads the same, `score spread 0.00 in 3, non-finite scores in 1`.
 */
const describeShapes = (shapes: readonly ScoreShape[]): string => {
    const counted = [...Map.groupBy(shapes.map(describeShape), (description) => description)].map(
        ([description, same]) => ({ description, count: same.length }),
    );
    if (counted.every(({ count }) => count === 1)) {
        return counted.map(({ description }) => description).join(', ');
    }
    const [single, ...others] = counted;
    return single !== undefined && others.length === 0
        ? `${single.description} in all ${single.count}`
        : counted.map(({ description, count }) => `${description} in ${count}`).join(', ');
};

/** A score spread needs at least one row, whatever a sensitivity sweep sets `MIN_HITS` to. */
const judgedRetrievals = (view: RunView, minHits: number): readonly JudgedRetrieval[] =>
    view.retrievals.flatMap((call) =>
        call.retrieved.kind === 'rows' && call.retrieved.hits.length >= Math.max(1, minHits)
            ? [{ spanId: call.spanId, hits: call.retrieved.hits, truncatedItems: call.retrieved.truncatedItems }]
            : [],
    );

const truncationNote = (retrievals: readonly JudgedRetrieval[]): string => {
    const unseen = retrievals.reduce((sum, retrieval) => sum + retrieval.truncatedItems, 0);
    return unseen === 0 ? '' : `; ${unseen} rows past the span array cap were not seen`;
};

/** Fires when a retrieval returns rows whose scores carry no ranking signal: all equal, or not numbers at all. */
export const detectFlatScore: Detector<RunView, FlatScoreThresholds> = (view, { MIN_HITS, MAX_FLAT_SPREAD }) => {
    const judged = judgedRetrievals(view, MIN_HITS.value);
    if (judged.length === 0) {
        return { kind: 'not-applicable', reason: `no retrieval returned at least ${MIN_HITS.value} rows` };
    }
    const shaped = judged.map((retrieval) => ({ retrieval, shape: scoreShape(retrieval.hits) }));
    const flat = shaped.filter(({ shape }) => isFlat(shape, MAX_FLAT_SPREAD.value));
    const note = truncationNote(judged);
    if (flat.length === 0) {
        const narrowest = Math.min(...shaped.flatMap(({ shape }) => (shape.kind === 'finite' ? [shape.spread] : [])));
        return {
            kind: 'clear',
            evidence: {
                summary: `${retrievalCount(judged.length)} ranked ${judged.length === 1 ? 'its' : 'their'} rows; narrowest score spread ${narrowest.toPrecision(3)}${note}`,
            },
        };
    }
    return {
        kind: 'fired',
        severity: unitIntervalSchema.parse(flat.length / judged.length),
        evidence: {
            spanIds: flat.map(({ retrieval }) => retrieval.spanId),
            summary: `${retrievalsAmong(flat.length, judged.length)} returned rows with no ranking signal (${describeShapes(flat.map(({ shape }) => shape))})${note}`,
        },
    };
};
