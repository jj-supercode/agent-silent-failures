import type { LibSQLVector } from '@mastra/libsql';
import { z } from 'zod';

import type { RetrievalHit } from '../../trace/index.ts';
import { chunkMetadataSchema } from '../chunk-metadata.ts';
import type { Embedder } from '../embedder/model.ts';
import { CorruptVectorMetadataError } from '../errors.ts';
import { vectorIdSchema } from '../model.ts';
import type { Retriever } from './model.ts';

type QueryResult = Awaited<ReturnType<LibSQLVector['query']>>[number];

const toHit = (result: QueryResult): RetrievalHit => {
    const metadata = chunkMetadataSchema.safeParse(result.metadata);
    if (!metadata.success) {
        throw new CorruptVectorMetadataError(vectorIdSchema.parse(result.id), z.prettifyError(metadata.error));
    }
    return { ...metadata.data, score: result.score };
};

export type VectorRetrieverDependencies = {
    readonly vectorStore: LibSQLVector;
    readonly indexName: string;
    readonly embedder: Embedder;
};

/** Plain dense retrieval: embed the query, take the top K rows by cosine similarity. */
export const createVectorRetriever =
    ({ vectorStore, indexName, embedder }: VectorRetrieverDependencies): Retriever =>
    async ({ query, topK, metadataFilter, minScore }) => {
        const results = await vectorStore.query({
            indexName,
            queryVector: [...(await embedder.embedQuery(query))],
            topK,
            ...(metadataFilter === null ? {} : { filter: metadataFilter }),
            ...(minScore === null ? {} : { minScore }),
        });
        return results.map(toHit);
    };
