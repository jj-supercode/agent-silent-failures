import { createStep } from '@mastra/core/workflows';

import type { Embedder } from '../embedder/model.ts';
import { chunkedCorpusSchema, embeddedCorpusSchema } from './model.ts';

/** Embeds chunk texts as they are. A wrapped embedder may return fewer vectors; that mismatch is kept, not fixed. */
export const createEmbedChunksStep = (embedder: Embedder) =>
    createStep({
        id: 'embed-chunks',
        description: 'Embeds every chunk with the configured embedder',
        inputSchema: chunkedCorpusSchema,
        outputSchema: embeddedCorpusSchema,
        execute: async ({ inputData }) => ({
            ...inputData,
            vectors: await embedder.embedDocuments(inputData.chunks.map((chunk) => chunk.text)),
        }),
    });
