import type { ModelId, TokenCount } from '../../trace/index.ts';

export type Vector = readonly number[];

/** The embedding seam: faults wrap it (drop vectors, truncate text, zero vectors) without touching ingestion code. */
export type Embedder = {
    readonly modelId: ModelId;
    /** Everything besides the text that determines a vector: model, input window, library version. */
    readonly fingerprint: string;
    readonly dimension: number;
    /** Tokens the embedder reads per input; anything beyond is silently ignored. */
    readonly maxInputTokens: TokenCount;
    readonly embedDocuments: (texts: readonly string[]) => Promise<readonly Vector[]>;
    readonly embedQuery: (text: string) => Promise<Vector>;
};

export type EmbedderWrapper = (embedder: Embedder) => Embedder;
