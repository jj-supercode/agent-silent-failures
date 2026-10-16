import type { FaultExpression } from './model.ts';

/** A scripted policy fault: the model's behaviour is the fault, so it acts on every run. */
export const policyAlwaysExpressed: FaultExpression = {
    kind: 'always',
    reason: 'the scripted policy produces the faulty behaviour on every run',
};

/** The embedder or the store flattens every score, so every retrieval of the run returns flat or NaN scores. */
export const scoresAlwaysFlattened: FaultExpression = {
    kind: 'always',
    reason: 'every retrieval of the run returns flat or non-finite scores',
};

/**
 * Over short documents, default 4,000-character chunks can all fit the window: then nothing was truncated. Expressed
 * only when the embedder itself shows the loss: some chunk embeds to the same vector as its window head.
 */
export const someChunkTruncated: FaultExpression = {
    kind: 'ingestion',
    observable: 'some chunk embeds to the same vector as its head cut at the embedder window',
    isExpressed: (observed) => observed.truncatedChunkCount > 0,
};

/** A batch cap drops nothing when every batch is already within the cap (a corpus of only a few chunks). */
export const someChunkNotStored: FaultExpression = {
    kind: 'ingestion',
    observable: 'the vector store holds fewer rows than the chunker produced chunks',
    isExpressed: (observed) => observed.storedRowCount < observed.chunkCount,
};

/** Zeroing every n-th vector zeroes at least one as soon as there is a chunk. */
export const someStoredRowUnreachable: FaultExpression = {
    kind: 'ingestion',
    observable: 'some stored row is returned by no query (a zero vector)',
    isExpressed: (observed) => observed.reachableRowCount < observed.storedRowCount,
};
