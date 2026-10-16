import { resolveObservabilityContext } from '@mastra/core/observability';
import { createStep } from '@mastra/core/workflows';
import { MDocument } from '@mastra/rag';
import { z } from 'zod';

import { chunkIdSchema, sourceIdSchema, type SourceId } from '../../trace/index.ts';
import type { ChunkingSettings } from '../config.ts';
import type { TokenCounter } from '../embedder/token-counter.ts';
import { chunkedCorpusSchema, ingestionInputSchema, type IngestedChunk } from './model.ts';

/** What chunking keeps of each document's metadata: its source, set below on every `MDocument` doc. */
const chunkSourceSchema = z.object({ sourceId: sourceIdSchema });

export type SourcedText = { readonly sourceId: SourceId; readonly text: string };

/** Chunk ids are `<sourceId>#<n>`, numbered per source in chunk order, in one pass over the corpus. */
export const withChunkIds = (chunks: readonly SourcedText[]): readonly Omit<IngestedChunk, 'tokenCount'>[] => {
    const positions = chunks.map((chunk, position) => ({ sourceId: chunk.sourceId, position }));
    const ordinalAt = new Map(
        [...Map.groupBy(positions, ({ sourceId }) => sourceId).values()].flatMap((sameSource) =>
            sameSource.map(({ position }, ordinal) => [position, ordinal] as const),
        ),
    );
    return chunks.map((chunk, position) => ({
        ...chunk,
        chunkId: chunkIdSchema.parse(`${chunk.sourceId}#${ordinalAt.get(position) ?? 0}`),
    }));
};

export type ChunkDocumentsStepDependencies = {
    readonly chunking: ChunkingSettings;
    readonly tokenCounter: TokenCounter;
};

export const chunkDocumentsStepId = 'chunk-documents';

/** One `MDocument` over all sources, so Mastra records a single chunk action for the whole corpus. */
export const createChunkDocumentsStep = ({ chunking, tokenCounter }: ChunkDocumentsStepDependencies) =>
    createStep({
        id: chunkDocumentsStepId,
        description: 'Chunks every source document and measures each chunk with the embedder tokenizer',
        inputSchema: ingestionInputSchema,
        outputSchema: chunkedCorpusSchema,
        execute: async (context) => {
            const document = new MDocument({
                type: 'text',
                docs: context.inputData.documents.map(({ sourceId, text }) => ({ text, metadata: { sourceId } })),
            });
            const chunks = await document.chunk(chunking, {
                observabilityContext: resolveObservabilityContext(context),
            });
            const sourced = chunks.map((chunk) => ({
                sourceId: chunkSourceSchema.parse(chunk.metadata).sourceId,
                text: chunk.text,
            }));
            return {
                documentCount: context.inputData.documents.length,
                chunks: await Promise.all(
                    withChunkIds(sourced).map(async (chunk) => ({
                        ...chunk,
                        tokenCount: await tokenCounter.countTokens(chunk.text),
                    })),
                ),
            };
        },
    });
