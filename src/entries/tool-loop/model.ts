import type { ThresholdSet, Thresholds } from '../contract.ts';

export type { Detector, Verdict } from '../contract.ts';

export const toolLoopThresholds = {
    MIN_REPEATS: {
        value: 3,
        basis: 'two similar calls are a plausible retry after a transient failure; three matches DeepEval AgentLoopDetectionMetric',
        calibratedOn: 'prior',
    },
    ARG_SIMILARITY: {
        value: 0.8,
        basis: 'Jaccard of query terms: one added term at four or more terms passes (0.8), one substituted term at up to eight terms fails (0.6 to 0.78)',
        calibratedOn: 'prior',
    },
    MIN_QUERY_TERMS: {
        value: 3,
        basis: 'Jaccard is too coarse on one or two terms, so shorter queries must have identical terms to count as repeats',
        calibratedOn: 'prior',
    },
    MAX_RETRIES: {
        value: 2,
        basis: 'a call re-issued after the same call failed is a retry; up to two retries in a row after an error is normal recovery, a third is not',
        calibratedOn: 'prior',
    },
    MIN_CYCLES: {
        value: 2,
        basis: 'A-B-A-B: two full cycles of two different calls; at three cycles each call already repeats MIN_REPEATS times',
        calibratedOn: 'prior',
    },
} as const satisfies Thresholds;

export type ToolLoopThresholds = ThresholdSet<keyof typeof toolLoopThresholds>;

/**
 * The step budget severity is measured against when the trace records none, which is always the case on Mastra 1.77
 * (`agent_run` spans carry no `maxSteps`). It scales severity only and never decides whether the entry fires, so it
 * is a constant, not a threshold. 5 is the default of Mastra's legacy agent loop
 * (`@mastra/core` 1.77.0, `model-*.js`).
 */
export const assumedStepBudget = 5;
