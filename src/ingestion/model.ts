import type { ChunkCount, IngestionReport, TokenCount } from '../trace/model.ts';

/** One chunk as the pipeline produced it, with its length in the embedder's own tokens (before truncation). */
export type MeasuredChunk = { readonly text: string; readonly tokenCount: TokenCount };

/** What the index reported after the upsert. */
export type IndexCounts = {
    /** Vectors the pipeline sent to the store. */
    readonly upsertedCount: ChunkCount;
    /** Vectors the store says the index holds (e.g. `describeIndex().count`). */
    readonly vectorCount: ChunkCount;
};

/** The parts of a report a pipeline knows before it measures anything. */
export type IngestionSetup = Pick<IngestionReport, 'indexName' | 'embedder' | 'chunking' | 'documentCount'> & {
    /** Names the tokenizer the token counts came from. */
    readonly tokenCounter: string;
};

export type MeasuredIngestion = IngestionSetup & {
    readonly chunks: readonly MeasuredChunk[];
    /** The embedder's vectors in chunk order; fewer than `chunks` when the embedder dropped some. */
    readonly vectors: readonly (readonly number[])[];
    readonly index: IndexCounts;
};

/** Counts tokens with the embedder's own tokenizer, untruncated. May be async, as native tokenizers are. */
export type CountTokens = (text: string) => number | Promise<number>;

export type IngestionReportInput = IngestionSetup & {
    readonly chunkTexts: readonly string[];
    readonly vectors: readonly (readonly number[])[];
    readonly countTokens: CountTokens;
    readonly index: IndexCounts;
};
