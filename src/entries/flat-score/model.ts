import type { ThresholdSet, Thresholds } from '../contract.ts';

export type { Detector, Verdict } from '../contract.ts';

export const flatScoreThresholds = {
    /** Fewest rows a retrieval must return before its scores are judged; two rows can tie legitimately. */
    MIN_HITS: {
        value: 3,
        basis: 'two rows can tie legitimately (a duplicated chunk); three equal scores from distinct embeddings cannot',
        calibratedOn: 'prior',
    },
    /** Largest max-minus-min score range that still counts as no ranking signal at all. */
    MAX_FLAT_SPREAD: {
        value: 1e-6,
        basis: 'float32 noise level of stored vectors; a working dense retrieval spreads its top rows far wider',
        calibratedOn: 'prior',
    },
} as const satisfies Thresholds;

export type FlatScoreThresholds = ThresholdSet<keyof typeof flatScoreThresholds>;
