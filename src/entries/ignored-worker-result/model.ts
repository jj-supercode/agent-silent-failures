import type { ThresholdSet, Thresholds } from '../contract.ts';

export type { Detector, Verdict } from '../contract.ts';

export const ignoredWorkerResultThresholds = {
    /** Largest share of a worker's facts that may reach the answer while the worker still counts as ignored. */
    MAX_IGNORED_OVERLAP: {
        value: 0,
        basis: 'strict: fires only when not one fact that only this worker contributed reaches the answer, trading catch rate for few false alarms',
        calibratedOn: 'prior',
    },
} as const satisfies Thresholds;

export type IgnoredWorkerResultThresholds = ThresholdSet<keyof typeof ignoredWorkerResultThresholds>;
