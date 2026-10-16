import type { ThresholdSet, Thresholds } from '../contract.ts';

export type { Detector, Verdict } from '../contract.ts';

export const delegationPingPongThresholds = {
    MIN_REDELEGATIONS: {
        value: 3,
        basis: 'one re-delegation is a plausible retry of an empty reply; a third send of the same task is not',
        calibratedOn: 'prior',
    },
    PROMPT_SIMILARITY: {
        value: 0.8,
        basis: 'Jaccard of prompt terms, applied only to prompts naming the same salient tokens equally often, so it absorbs rewording and never an entity swap',
        calibratedOn: 'prior',
    },
    WORKER_TEXT_SIMILARITY: {
        value: 0.9,
        basis: 'Jaccard of the facts two replies name (names, numbers, quoted words), so rewording is no change; at 0.9 a reply adding one new fact to ten counts as unchanged, two do not',
        calibratedOn: 'prior',
    },
    MIN_BOUNCE_LENGTH: {
        value: 4,
        basis: 'A-B-A-B: two full rounds between two workers with no new information',
        calibratedOn: 'prior',
    },
} as const satisfies Thresholds;

export type DelegationPingPongThresholds = ThresholdSet<keyof typeof delegationPingPongThresholds>;
