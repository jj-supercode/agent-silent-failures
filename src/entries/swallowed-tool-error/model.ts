import type { ThresholdSet, Thresholds } from '../contract.ts';

export type { Detector, Verdict } from '../contract.ts';

/** A rule, not a tuned cut: any unrecovered error answered without acknowledgement fires. */
export const swallowedToolErrorThresholds = {} as const satisfies Thresholds;

export type SwallowedToolErrorThresholds = ThresholdSet<keyof typeof swallowedToolErrorThresholds>;
