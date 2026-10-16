import { tokenCountSchema, type IngestionReport } from '../trace/model.ts';
import type { IngestionReportInput, MeasuredChunk } from './model.ts';
import { summarizeIngestion } from './summarize-ingestion.ts';

const measured = async (text: string, countTokens: IngestionReportInput['countTokens']): Promise<MeasuredChunk> => ({
    text,
    tokenCount: tokenCountSchema.parse(await countTokens(text)),
});

/**
 * The ingestion report for a pipeline's own chunks and vectors: counts each chunk's tokens with `countTokens`, then
 * summarizes (see `summarizeIngestion`). Record the result as the output of a `rag_ingestion` span.
 */
export const buildIngestionReport = async ({
    chunkTexts,
    countTokens,
    ...rest
}: IngestionReportInput): Promise<IngestionReport> =>
    summarizeIngestion({
        ...rest,
        chunks: await Array.fromAsync(chunkTexts, (text) => measured(text, countTokens)),
    });
