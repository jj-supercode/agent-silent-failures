import type { LibSQLVector } from '@mastra/libsql';

import { chunkCountSchema, type ChunkCount } from '../../trace/index.ts';

import type { Embedder } from '../embedder/model.ts';
import { isSameEmbedding } from '../embedder/vector-similarity.ts';
import type { WindowHead } from '../embedder/window-head.ts';
import type { IngestedChunk } from './model.ts';

/**
 * What an ingestion did, measured from its effects rather than from the report it records: the vector store is read
 * back and truncation is observed with the unwrapped embedder. The bed decides whether a fault took effect from
 * this, so "caught when expressed" never reads the field a detector reads.
 */
export type ObservedIngestion = {
    /** Chunks the chunker produced. */
    readonly chunkCount: ChunkCount;
    /** Rows the vector store holds after the upsert. */
    readonly storedRowCount: ChunkCount;
    /** Stored rows a query can return; a zero vector has no cosine, so no query ever reaches its row. */
    readonly reachableRowCount: ChunkCount;
    /** Chunks longer than the embedder window, as the tokenizer counts them. */
    readonly overWindowChunkCount: ChunkCount;
    /** Of those, chunks whose vector equals the vector of their window head: the tail was read and thrown away. */
    readonly truncatedChunkCount: ChunkCount;
};

export type ObserveIngestionInput = {
    readonly chunks: readonly IngestedChunk[];
    readonly vectorStore: LibSQLVector;
    readonly indexName: string;
    /** The base embedder, under no fault wrapper: what the stack would compute for a text. */
    readonly embedder: Embedder;
    readonly windowHead: WindowHead;
};

/** LibSQL keeps rows whose score is above `minScore`; cosine scores reach -1, so anything below admits every row. */
const belowEveryCosineScore = -2;

type CutChunk = { readonly text: string; readonly head: string };

const cutChunks = async (chunks: readonly IngestedChunk[], windowHead: WindowHead): Promise<readonly CutChunk[]> =>
    (await Promise.all(chunks.map(async ({ text }) => ({ text, head: await windowHead(text) })))).filter(
        ({ text, head }) => head.length < text.length,
    );

const countTruncated = async (cut: readonly CutChunk[], embedder: Embedder): Promise<ChunkCount> => {
    if (cut.length === 0) {
        return chunkCountSchema.parse(0);
    }
    const fullVectors = await embedder.embedDocuments(cut.map(({ text }) => text));
    const headVectors = await embedder.embedDocuments(cut.map(({ head }) => head));
    return chunkCountSchema.parse(
        fullVectors.filter((vector, index) => {
            const headVector = headVectors[index];
            return headVector !== undefined && isSameEmbedding(vector, headVector);
        }).length,
    );
};

/** A unit vector along the first axis: any finite, non-zero query scores every row whose vector has a norm. */
const probeVector = (dimension: number): number[] =>
    Array.from({ length: dimension }, (_, index) => (index === 0 ? 1 : 0));

const countReachableRows = async (
    vectorStore: LibSQLVector,
    indexName: string,
    dimension: number,
    storedRowCount: ChunkCount,
): Promise<ChunkCount> =>
    chunkCountSchema.parse(
        storedRowCount === 0
            ? 0
            : (
                  await vectorStore.query({
                      indexName,
                      queryVector: probeVector(dimension),
                      topK: storedRowCount,
                      minScore: belowEveryCosineScore,
                  })
              ).length,
    );

export const observeIngestion = async ({
    chunks,
    vectorStore,
    indexName,
    embedder,
    windowHead,
}: ObserveIngestionInput): Promise<ObservedIngestion> => {
    const storedRowCount = chunkCountSchema.parse((await vectorStore.describeIndex({ indexName })).count);
    const cut = await cutChunks(chunks, windowHead);
    return {
        chunkCount: chunkCountSchema.parse(chunks.length),
        storedRowCount,
        reachableRowCount: await countReachableRows(vectorStore, indexName, embedder.dimension, storedRowCount),
        overWindowChunkCount: chunkCountSchema.parse(cut.length),
        truncatedChunkCount: await countTruncated(cut, embedder),
    };
};
