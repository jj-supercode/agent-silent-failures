import { describe, expect, test } from 'vitest';

import { ingestionReportSchema, type IngestionReport } from './model.ts';
import { sampleSpan } from './testing.ts';
import { toIngestionView } from './to-ingestion-view.ts';

const chunkCount = 431;
const embedderLimit = 512;

const report: IngestionReport = ingestionReportSchema.parse({
    indexName: 'corpus',
    embedder: { modelId: 'bge-small-en-v1.5', maxInputTokens: embedderLimit },
    chunking: { strategy: 'recursive', maxSize: 1000, overlap: 100 },
    documentCount: 386,
    chunkCount,
    embeddedCount: chunkCount,
    upsertedCount: chunkCount,
    vectorCount: chunkCount,
    tokenCounts: {
        counter: 'sample',
        limit: embedderLimit,
        totalTokens: 48_662,
        maxChunkTokens: 270,
        overLimitCount: 0,
        tokensBeyondLimit: 0,
    },
    vectors: { zeroNormCount: 0, nonFiniteCount: 0, duplicateOfDistinctTextCount: 0 },
});

const root = (output: unknown) =>
    sampleSpan({
        spanId: 'root',
        startOffset: 0,
        parentSpanId: null,
        name: 'corpus ingestion',
        spanType: 'rag_ingestion',
        entityId: null,
        output,
    });

const chunkAction = sampleSpan({
    spanId: 'chunk',
    startOffset: 1,
    parentSpanId: null,
    name: 'rag chunk: recursive',
    spanType: 'rag_action',
    entityId: 'chunk',
    attributes: { action: 'chunk', strategy: 'recursive', chunkSize: 1000, chunkOverlap: 100 },
    output: { chunkCount },
});
const chunkUnderRoot = { ...chunkAction, parentSpanId: root(report).spanId };

describe('toIngestionView', () => {
    test('decodes the report from the root output and the chunk action Mastra recorded', () => {
        const result = toIngestionView([root(report), chunkUnderRoot]);
        expect(result).toEqual({
            kind: 'ingestion',
            view: {
                traceId: root(report).traceId,
                rootSpanId: root(report).spanId,
                report,
                chunkActions: [
                    { spanId: chunkAction.spanId, strategy: 'recursive', maxSize: 1000, overlap: 100, chunkCount },
                ],
            },
        });
    });

    test('rejects a root whose output is not an ingestion report', () => {
        const result = toIngestionView([root({ chunkCount })]);
        expect(result.kind === 'not-an-ingestion' && result.reason).toContain('not an ingestion report');
    });

    test('rejects a trace whose root is an agent run', () => {
        expect(toIngestionView([{ ...root(report), spanType: 'agent_run' }]).kind).toBe('not-an-ingestion');
    });

    test('ignores rag actions other than chunking', () => {
        const embedAction = { ...chunkUnderRoot, attributes: { action: 'embed' } };
        const result = toIngestionView([root(report), embedAction]);
        expect(result.kind === 'ingestion' && result.view.chunkActions).toEqual([]);
    });
});
