import { createStep } from '@mastra/core/workflows';
import type { LibSQLVector } from '@mastra/libsql';

import { summarizeIngestion } from '../../ingestion/index.ts';
import { chunkCountSchema, ingestionReportSchema, type IngestionReport } from '../../trace/index.ts';
import type { ChunkMetadata } from '../chunk-metadata.ts';
import type { ChunkingSettings } from '../config.ts';
import type { Embedder } from '../embedder/model.ts';
import type { TokenCounter } from '../embedder/token-counter.ts';
import { embeddedCorpusSchema, type EmbeddedCorpus } from './model.ts';

export type UpsertVectorsStepDependencies = {
    readonly vectorStore: LibSQLVector;
    readonly indexName: string;
    readonly embedder: Embedder;
    readonly chunking: ChunkingSettings;
    readonly tokenCounter: TokenCounter;
};

/** Vectors pair with chunks by position; surplus chunks without a vector are simply never upserted, as in the wild. */
const pairChunksWithVectors = (corpus: EmbeddedCorpus) =>
    corpus.vectors.flatMap((vector, index) => {
        const chunk = corpus.chunks[index];
        return chunk === undefined ? [] : [{ chunk, vector }];
    });

const toReport = (
    corpus: EmbeddedCorpus,
    upsertedCount: number,
    vectorCount: number,
    dependencies: UpsertVectorsStepDependencies,
): IngestionReport =>
    summarizeIngestion({
        indexName: dependencies.indexName,
        embedder: { modelId: dependencies.embedder.modelId, maxInputTokens: dependencies.embedder.maxInputTokens },
        chunking: dependencies.chunking,
        documentCount: corpus.documentCount,
        tokenCounter: dependencies.tokenCounter.name,
        chunks: corpus.chunks,
        vectors: corpus.vectors,
        index: {
            upsertedCount: chunkCountSchema.parse(upsertedCount),
            vectorCount: chunkCountSchema.parse(vectorCount),
        },
    });

export const createUpsertVectorsStep = (dependencies: UpsertVectorsStepDependencies) =>
    createStep({
        id: 'upsert-vectors',
        description: 'Stores the vectors with their chunk metadata and reports what the index now holds',
        inputSchema: embeddedCorpusSchema,
        outputSchema: ingestionReportSchema,
        execute: async ({ inputData }) => {
            const { vectorStore, indexName, embedder } = dependencies;
            const pairs = pairChunksWithVectors(inputData);
            await vectorStore.createIndex({ indexName, dimension: embedder.dimension, metric: 'cosine' });
            if (pairs.length > 0) {
                await vectorStore.upsert({
                    indexName,
                    ids: pairs.map(({ chunk }) => chunk.chunkId),
                    vectors: pairs.map(({ vector }) => [...vector]),
                    metadata: pairs.map(({ chunk }): ChunkMetadata => ({
                        chunkId: chunk.chunkId,
                        sourceId: chunk.sourceId,
                        text: chunk.text,
                    })),
                });
            }
            const index = await vectorStore.describeIndex({ indexName });
            return toReport(inputData, pairs.length, index.count, dependencies);
        },
    });
