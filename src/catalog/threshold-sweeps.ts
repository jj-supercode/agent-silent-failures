import type { ThresholdSweep } from './model.ts';

/**
 * The range each named threshold is swept over, one at a time. Each range contains the shipped value and reaches
 * far enough on both sides to show where catches start to drop or false alarms start to appear. Values outside an
 * entry's meaningful range are included on purpose: the detectors degrade safely there (their unit tests cover it).
 */
export const flatScoreSweeps: readonly ThresholdSweep[] = [
    {
        threshold: 'MIN_HITS',
        values: [1, 2, 3, 4, 5, 6],
        rationale: 'above topK the detector can never judge a call; at 1 a single row counts as flat',
    },
    {
        threshold: 'MAX_FLAT_SPREAD',
        values: [1e-9, 1e-6, 1e-4, 1e-2, 2e-2, 5e-2],
        rationale: 'the narrowest clean spread the bed measures is about 0.01, so false alarms should appear near 1e-2',
    },
];

export const emptyRetrievalAnsweredSweeps: readonly ThresholdSweep[] = [
    {
        threshold: 'MAX_HITS_FOR_EMPTY',
        values: [0, 1, 3, 5],
        rationale: 'treating a few rows as empty should start flagging clean answers once it reaches topK',
    },
];

export const embeddingCoverageSweeps: readonly ThresholdSweep[] = [
    {
        threshold: 'MAX_MISSING_CHUNKS',
        values: [0, 1, 5, 20],
        rationale: 'a tolerance hides small shortfalls; per-question ingestions miss only a few chunks',
    },
    {
        threshold: 'MAX_OVER_LIMIT_CHUNKS',
        values: [0, 1, 5, 20],
        rationale: 'a per-question default-chunk ingestion has only one to three over-limit chunks',
    },
    {
        threshold: 'MAX_DEGENERATE_VECTORS',
        values: [0, 1, 5, 20],
        rationale: 'zeroing every tenth vector of a small ingestion leaves only one or two degenerate vectors',
    },
];

export const toolLoopSweeps: readonly ThresholdSweep[] = [
    {
        threshold: 'MIN_REPEATS',
        values: [2, 3, 4, 5, 6],
        rationale: 'at 2 a legitimate retry or refinement looks like a loop; above 3 the shortest fault is missed',
    },
    {
        threshold: 'ARG_SIMILARITY',
        values: [0.5, 0.6, 0.7, 0.8, 0.9, 1],
        rationale: 'low values pair different queries; 1 demands exact repeats and misses formatting noise',
    },
    {
        threshold: 'MIN_QUERY_TERMS',
        values: [1, 2, 3, 5, 8],
        rationale: 'short queries need exact equality; a high value forces exact matching on most queries',
    },
    {
        threshold: 'MIN_CYCLES',
        values: [1, 2, 3],
        rationale: 'one A-B pair is ordinary; three cycles misses the two-cycle fault',
    },
    {
        threshold: 'MAX_RETRIES',
        values: [0, 1, 2, 3, 5],
        rationale: 'at 0 every retry of a failed call counts as a repeat; above 2 a loop on a failing tool is missed',
    },
];

export const swallowedToolErrorSweeps: readonly ThresholdSweep[] = [];

export const delegationPingPongSweeps: readonly ThresholdSweep[] = [
    {
        threshold: 'MIN_REDELEGATIONS',
        values: [2, 3, 4, 5, 7],
        rationale: 'at 2 the outage re-delegation looks like ping-pong; above 3 the shortest fault is missed',
    },
    {
        threshold: 'PROMPT_SIMILARITY',
        values: [0.5, 0.6, 0.7, 0.8, 0.9, 1],
        rationale: 'rewording drops similarity; 1 misses reworded re-sends',
    },
    {
        threshold: 'WORKER_TEXT_SIMILARITY',
        values: [0.5, 0.7, 0.8, 0.9, 1],
        rationale: 'the bounce rule needs unchanged worker replies; 1 demands identical text',
    },
    {
        threshold: 'MIN_BOUNCE_LENGTH',
        values: [3, 4, 5, 6],
        rationale: 'three alternations can be one legitimate check; above 4 the two-round bounce is missed',
    },
];

export const ignoredWorkerResultSweeps: readonly ThresholdSweep[] = [
    {
        threshold: 'MAX_IGNORED_OVERLAP',
        values: [0, 0.1, 0.25, 0.5],
        rationale:
            'raising the overlap a supervisor may still show and count as ignored turns partial use into "ignored"',
    },
];
