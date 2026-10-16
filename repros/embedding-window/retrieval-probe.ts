import { fastembed } from '@mastra/fastembed';
import { LibSQLVector } from '@mastra/libsql';
import { embedMany } from 'ai';
import { z } from 'zod';

import { inBatches } from '../../src/harness/index.ts';
import { chunkCoversSentence } from './sentences.ts';
import { wilsonEstimate, type ProportionEstimate } from './proportion-estimate.ts';

export const retrievalTopK = 5;

const chunkMetadataSchema = z.object({ text: z.string() });

export type RetrievalHitRates = {
    readonly hitAt1: ProportionEstimate;
    readonly hitAtTopK: ProportionEstimate;
};

export type ChunkIndex = {
    readonly hitRates: (sentences: readonly string[]) => Promise<RetrievalHitRates>;
};

/**
 * fastembed pads every input of a call to 512 tokens, so one call over hundreds of chunks needs gigabytes. Sequential
 * batches keep the peak near one batch; each input is padded to the same length either way, so vectors are unchanged.
 */
const embeddingBatchSize = 16;

const embedAll = async (values: readonly string[]): Promise<readonly (readonly number[])[]> =>
    (
        await Array.fromAsync(
            inBatches(values, embeddingBatchSize),
            async (batch) => (await embedMany({ model: fastembed, values: [...batch] })).embeddings,
        )
    ).flat();

/** Embeds every chunk with Mastra's default local embedder into an in-memory LibSQL index. */
export const buildChunkIndex = async (indexName: string, chunkTexts: readonly string[]): Promise<ChunkIndex> => {
    const vectorStore = new LibSQLVector({ id: `repro-${indexName}`, url: 'file::memory:' });
    const chunkEmbeddings = await embedAll(chunkTexts);
    await vectorStore.createIndex({ indexName, dimension: chunkEmbeddings[0]?.length ?? 0 });
    await vectorStore.upsert({
        indexName,
        vectors: chunkEmbeddings.map((embedding) => [...embedding]),
        metadata: chunkTexts.map((text) => ({ text })),
    });

    const rankOfCoveringChunk = async (sentence: string, queryVector: readonly number[]): Promise<number> => {
        const results = await vectorStore.query({ indexName, queryVector: [...queryVector], topK: retrievalTopK });
        return results.findIndex((result) =>
            chunkCoversSentence(chunkMetadataSchema.parse(result.metadata).text, sentence),
        );
    };

    const hitRates = async (sentences: readonly string[]): Promise<RetrievalHitRates> => {
        const queryVectors = await embedAll(sentences);
        const ranks = await Promise.all(
            sentences.map((sentence, index) => rankOfCoveringChunk(sentence, queryVectors[index] ?? [])),
        );
        return {
            hitAt1: wilsonEstimate(ranks.filter((rank) => rank === 0).length, ranks.length),
            hitAtTopK: wilsonEstimate(ranks.filter((rank) => rank >= 0).length, ranks.length),
        };
    };

    return { hitRates };
};
