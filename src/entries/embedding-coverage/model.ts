import type { ThresholdSet, Thresholds } from '../contract.ts';

export type { Detector, Verdict } from '../contract.ts';

export const embeddingCoverageThresholds = {
    /** Chunks the chunker produced that may end up without a vector in the index. */
    MAX_MISSING_CHUNKS: {
        value: 0,
        basis: 'every chunk a pipeline produces is meant to be searchable; a deliberate skip should not be a chunk',
        calibratedOn: 'invariant',
    },
    /** Chunks that may be longer than the embedder's input window, so their tail is never embedded. */
    MAX_OVER_LIMIT_CHUNKS: {
        value: 0,
        basis: 'tokens past the embedder window are dropped without a warning, so any over-limit chunk loses text',
        calibratedOn: 'invariant',
    },
    /** Vectors that may be zero, non-finite, or identical to the vector of a different text. */
    MAX_DEGENERATE_VECTORS: {
        value: 0,
        basis: 'a zero, non-finite or duplicated vector cannot rank its chunk against a query',
        calibratedOn: 'invariant',
    },
} as const satisfies Thresholds;

export type EmbeddingCoverageThresholds = ThresholdSet<keyof typeof embeddingCoverageThresholds>;
