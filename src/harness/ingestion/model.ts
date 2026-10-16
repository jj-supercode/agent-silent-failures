import { z } from 'zod';

import { sourceDocumentSchema } from '../../corpus/index.ts';
import { chunkIdSchema, sourceIdSchema, tokenCountSchema } from '../../trace/index.ts';

export const ingestionInputSchema = z.object({ documents: z.array(sourceDocumentSchema).readonly() });

export const ingestedChunkSchema = z.object({
    chunkId: chunkIdSchema,
    sourceId: sourceIdSchema,
    text: z.string(),
    /** Measured with the embedder's tokenizer, before the embedder truncates. */
    tokenCount: tokenCountSchema,
});
export type IngestedChunk = z.infer<typeof ingestedChunkSchema>;

export const chunkedCorpusSchema = z.object({
    documentCount: z.int().nonnegative(),
    chunks: z.array(ingestedChunkSchema).readonly(),
});

/** NaN components are allowed on purpose: a faulty embedder emits them, and ingestion must record, not reject. */
const vectorComponentSchema = z.union([z.number(), z.nan()]);

export const embeddedCorpusSchema = chunkedCorpusSchema.extend({
    vectors: z.array(z.array(vectorComponentSchema).readonly()).readonly(),
});
export type EmbeddedCorpus = z.infer<typeof embeddedCorpusSchema>;
