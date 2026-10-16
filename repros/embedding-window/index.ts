export {
    fastembedCacheDirectory,
    fastembedMaxContentTokens,
    fastembedMaxTokens,
    loadBgeTokenCounter,
    type BgeTokenCounter,
    type TokenCoverage,
} from './bge-tokenizer.ts';
export { gutenbergBody, loadOriginOfSpecies, originOfSpeciesFile } from './gutenberg-corpus.ts';
export { buildChunkIndex, retrievalTopK, type ChunkIndex, type RetrievalHitRates } from './retrieval-probe.ts';
export { chunkCoversSentence, isQueryCandidate, locatedSentences, type LocatedSentence } from './sentences.ts';
export { distributionOf, type Distribution } from './distribution.ts';
export { formatEstimate, wilsonEstimate, type ProportionEstimate } from './proportion-estimate.ts';
export { evenlySpacedSample } from './sampling.ts';
export { percentText, shareOf } from './shares.ts';
export {
    isOverflowing,
    measureChunks,
    sentencesInRegion,
    type ChunkRegion,
    type MeasuredChunk,
    type RegionSentence,
} from './measured-chunks.ts';
export { overflowSummary, type OverflowSummary } from './overflow-summary.ts';
