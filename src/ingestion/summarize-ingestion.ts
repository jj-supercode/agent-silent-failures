import { chunkCountSchema, ingestionReportSchema, type IngestionReport } from '../trace/model.ts';
import type { MeasuredIngestion } from './model.ts';
import { summarizeTokenCounts } from './token-count-stats.ts';
import { summarizeVectors } from './vector-stats.ts';

/**
 * The ingestion report embedding-coverage reads, from chunks already measured in tokens. Vectors pair with chunks
 * by position, as most pipelines pair them; chunks past the last vector have none.
 */
export const summarizeIngestion = ({
    indexName,
    embedder,
    chunking,
    documentCount,
    tokenCounter,
    chunks,
    vectors,
    index,
}: MeasuredIngestion): IngestionReport =>
    ingestionReportSchema.parse({
        indexName,
        embedder,
        chunking,
        documentCount,
        chunkCount: chunkCountSchema.parse(chunks.length),
        embeddedCount: chunkCountSchema.parse(vectors.length),
        upsertedCount: index.upsertedCount,
        vectorCount: index.vectorCount,
        tokenCounts: summarizeTokenCounts(
            chunks.map((chunk) => chunk.tokenCount),
            embedder.maxInputTokens,
            tokenCounter,
        ),
        vectors: summarizeVectors(
            vectors.flatMap((vector, position) => {
                const chunk = chunks[position];
                return chunk === undefined ? [] : [{ text: chunk.text, vector }];
            }),
        ),
    } satisfies IngestionReport);
