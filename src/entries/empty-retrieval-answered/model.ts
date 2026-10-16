import type { ThresholdSet, Thresholds } from '../contract.ts';

export type { Detector, Verdict } from '../contract.ts';

export const emptyRetrievalAnsweredThresholds = {
    /** Most rows a retrieval may return and still count as having found nothing. */
    MAX_HITS_FOR_EMPTY: {
        value: 0,
        basis: 'an empty row list is the failure itself; any returned row gives the agent something to ground on',
        calibratedOn: 'invariant',
    },
} as const satisfies Thresholds;

export type EmptyRetrievalAnsweredThresholds = ThresholdSet<keyof typeof emptyRetrievalAnsweredThresholds>;
