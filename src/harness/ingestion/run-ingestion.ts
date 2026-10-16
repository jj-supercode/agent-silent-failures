import type { Mastra } from '@mastra/core/mastra';
import { startRagIngestion } from '@mastra/core/observability';

import type { SourceDocument } from '../../corpus/index.ts';
import { traceIdSchema, type IngestionReport, type TraceId } from '../../trace/index.ts';
import type { Embedder } from '../embedder/model.ts';
import { chunkDocumentsStepId } from './chunk-documents-step.ts';
import { chunkedCorpusOfStep } from './chunked-corpus-of-step.ts';
import type { IngestionWorkflow } from './ingestion-workflow.ts';
import type { IngestedChunk } from './model.ts';

export type IngestionRecord = {
    readonly traceId: TraceId;
    readonly report: IngestionReport;
    /** Every chunk with its measured token count, kept in process; the trace only carries counts. */
    readonly chunks: readonly IngestedChunk[];
};

export type IngestionOutcome =
    | { readonly kind: 'ingested'; readonly record: IngestionRecord }
    | { readonly kind: 'failed'; readonly reason: string };

export type RunIngestionInput = {
    readonly mastra: Mastra;
    /** Must be registered on `mastra`, which is what links its run to the ingestion span. */
    readonly workflow: IngestionWorkflow;
    readonly documents: readonly SourceDocument[];
    readonly indexName: string;
    readonly embedder: Embedder;
};

/**
 * Runs the ingestion workflow under a `rag_ingestion` root span. `startRagIngestion` (the manual sibling of
 * `withRagIngestion`) is used because the caller needs the span's trace id as well as the report it records.
 */
export const runIngestion = async ({
    mastra,
    workflow,
    documents,
    indexName,
    embedder,
}: RunIngestionInput): Promise<IngestionOutcome> => {
    const { span, observabilityContext } = startRagIngestion({
        mastra,
        name: 'corpus ingestion',
        attributes: {
            vectorStore: 'libsql',
            indexName,
            embeddingModel: embedder.modelId,
            embeddingProvider: 'fastembed',
            sourceCount: documents.length,
        },
    });
    if (span === undefined) {
        return { kind: 'failed', reason: 'observability is not configured, so ingestion would leave no trace' };
    }
    try {
        const run = await workflow.createRun();
        const result = await run.start({ inputData: { documents }, ...observabilityContext });
        if (result.status !== 'success') {
            const reason = result.status === 'failed' ? result.error.message : `workflow ended as ${result.status}`;
            span.error({ error: new Error(reason) });
            return { kind: 'failed', reason };
        }
        span.end({ output: result.result });
        const chunked = chunkedCorpusOfStep(result.steps[chunkDocumentsStepId]);
        return chunked.kind === 'read'
            ? {
                  kind: 'ingested',
                  record: { traceId: traceIdSchema.parse(span.traceId), report: result.result, chunks: chunked.chunks },
              }
            : { kind: 'failed', reason: chunked.reason };
    } catch (error) {
        span.error({ error: error instanceof Error ? error : new Error(String(error)) });
        return { kind: 'failed', reason: String(error) };
    }
};
