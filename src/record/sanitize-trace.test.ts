import { describe, expect, test } from 'vitest';

import {
    spanIdSchema,
    spanRecordListSchema,
    spanTypes,
    toIngestionView,
    toRunView,
    toRunViews,
    type SpanRecord,
} from '../trace/index.ts';
import {
    descendingScore,
    sampleAgentRunSpans,
    sampleHits,
    sampleRetrievalTools,
    sampleSpan,
    sampleWorkflowSpans,
} from '../trace/testing.ts';
import { keptSpanTypes, sanitizeTrace } from './sanitize-trace.ts';

const supervisorRun = sampleAgentRunSpans({
    agentId: 'supervisor',
    outputText: 'Paris is the capital of France [S1].',
    maxSteps: 6,
    steps: [
        {
            workerName: 'researcher',
            prompt: 'Find the capital of France',
            worker: {
                agentId: 'researcher',
                outputText: 'Paris [S1].',
                steps: [
                    {
                        toolName: 'searchCorpus',
                        args: { query: 'capital of France' },
                        result: { returned: { hits: sampleHits(3, descendingScore) } },
                    },
                    {
                        toolName: 'searchCorpus',
                        args: { query: 'France capital city' },
                        result: { threw: 'upstream 503' },
                    },
                ],
            },
        },
    ],
});

const workerOnly = {
    agentId: 'researcher',
    outputText: 'Paris [S1].',
    steps: [
        {
            toolName: 'searchCorpus',
            args: { query: 'capital of France' },
            result: { returned: { hits: sampleHits(3, descendingScore) } },
        },
    ],
};

const ingestionReport = {
    indexName: 'corpus',
    embedder: { modelId: 'bge-small-en-v1.5', maxInputTokens: 512 },
    chunking: { strategy: 'recursive', maxSize: 4000, overlap: 200 },
    documentCount: 2,
    chunkCount: 3,
    embeddedCount: 3,
    upsertedCount: 3,
    vectorCount: 3,
    tokenCounts: {
        counter: 'tokenizer',
        limit: 512,
        totalTokens: 1400,
        maxChunkTokens: 700,
        overLimitCount: 1,
        tokensBeyondLimit: 188,
    },
    vectors: { zeroNormCount: 0, nonFiniteCount: 0, duplicateOfDistinctTextCount: 0 },
};

/** `rag_ingestion > workflow_run > workflow_step > rag_action`, plus a model span the recorder drops. */
const ingestionTrace = [
    sampleSpan({
        spanId: 'ingestion',
        startOffset: 0,
        parentSpanId: null,
        name: 'corpus ingestion',
        spanType: spanTypes.ragIngestion,
        entityId: null,
        attributes: { vectorStore: 'libsql', indexName: 'corpus' },
        output: { ...ingestionReport, extra: 'not read' },
    }),
    sampleSpan({
        spanId: 'workflow',
        startOffset: 1,
        parentSpanId: spanIdSchema.parse('ingestion'),
        name: 'workflow',
        spanType: spanTypes.workflowRun,
        entityId: 'ingest',
    }),
    sampleSpan({
        spanId: 'step',
        startOffset: 2,
        parentSpanId: spanIdSchema.parse('workflow'),
        name: 'chunk step',
        spanType: 'workflow_step',
        entityId: 'chunk-documents',
    }),
    sampleSpan({
        spanId: 'chunk',
        startOffset: 3,
        parentSpanId: spanIdSchema.parse('step'),
        name: 'chunk',
        spanType: spanTypes.ragAction,
        entityId: null,
        attributes: { action: 'chunk', strategy: 'recursive', chunkSize: 4000, chunkOverlap: 200, extra: 'x' },
        output: { chunkCount: 3 },
    }),
    sampleSpan({
        spanId: 'embed',
        startOffset: 4,
        parentSpanId: spanIdSchema.parse('step'),
        name: 'embed',
        spanType: 'model_generation',
        entityId: null,
        input: ['private chunk text'],
    }),
];

const runViewOf = (spans: readonly SpanRecord[]) => toRunView(spans, { retrievalTools: sampleRetrievalTools() });

describe('sanitizeTrace', () => {
    test('keeps only the span types detectors read', () => {
        const kept = sanitizeTrace(supervisorRun);
        expect(kept.every((span) => keptSpanTypes.has(span.spanType))).toBe(true);
        expect(kept.length).toBeLessThan(supervisorRun.length);
    });

    test('builds the same run view as the full trace', () => {
        expect(runViewOf(sanitizeTrace(supervisorRun))).toEqual(runViewOf(supervisorRun));
    });

    test('builds the same run views as the full trace for agents called from a workflow', () => {
        const workflow = sampleWorkflowSpans('two-steps', [workerOnly, workerOnly]);
        const viewsOf = (spans: readonly SpanRecord[]) => toRunViews(spans, { retrievalTools: sampleRetrievalTools() });
        expect(viewsOf(sanitizeTrace(workflow))).toEqual(viewsOf(workflow));
        expect(viewsOf(sanitizeTrace(workflow)).kind).toBe('runs');
    });

    test('builds the same ingestion view as the full trace', () => {
        const sanitized = toIngestionView(sanitizeTrace(ingestionTrace));
        expect(sanitized).toEqual(toIngestionView(ingestionTrace));
        expect(sanitized.kind === 'ingestion' && sanitized.view.chunkActions).toHaveLength(1);
    });

    test('re-parents a tool call onto its agent run once the model spans between them are gone', () => {
        const kept = sanitizeTrace(supervisorRun);
        const byId = new Map(kept.map((span) => [span.spanId, span]));
        const parentTypes = kept
            .filter((span) => span.spanType === spanTypes.toolCall)
            .map((span) => (span.parentSpanId === null ? null : byId.get(span.parentSpanId)?.spanType));
        expect(parentTypes.every((type) => type === spanTypes.agentRun)).toBe(true);
    });

    test('keeps a parent id that points outside the trace, so a cut trace still reads as cut', () => {
        const cut = [
            sampleSpan({
                spanId: 'tool',
                startOffset: 0,
                parentSpanId: null,
                name: 'tool',
                spanType: spanTypes.toolCall,
                entityId: 'searchCorpus',
            }),
        ].map((span) => ({ ...span, parentSpanId: supervisorRun[0]?.spanId ?? null }));
        expect(sanitizeTrace(cut)[0]?.parentSpanId).toBe(supervisorRun[0]?.spanId);
    });

    test('drops a thrown error stack, keeping its name and message', () => {
        const thrown = [
            sampleSpan({
                spanId: 'tool',
                startOffset: 0,
                parentSpanId: null,
                name: 'tool',
                spanType: spanTypes.toolCall,
                entityId: 'searchCorpus',
                error: {
                    name: 'Error',
                    message: 'upstream 503',
                    stack: 'Error: upstream 503\n    at /Users/someone/app.ts:1',
                },
            }),
        ];
        expect(sanitizeTrace(thrown)[0]?.error).toEqual({ name: 'Error', message: 'upstream 503' });
    });

    test('drops the prompt and instructions of an agent run, keeping its answer text', () => {
        const [agentRun] = sanitizeTrace([
            sampleSpan({
                spanId: 'agent',
                startOffset: 0,
                parentSpanId: null,
                name: 'agent run',
                spanType: spanTypes.agentRun,
                entityId: 'rag-agent',
                attributes: { instructions: 'secret system prompt', availableTools: ['searchCorpus'] },
                input: [{ role: 'user', content: 'private question' }],
                output: { text: 'Paris.', files: [] },
            }),
        ]);
        expect(agentRun?.attributes).toEqual({});
        expect(agentRun?.input).toBeUndefined();
        expect(agentRun?.output).toEqual({ text: 'Paris.' });
    });

    test('a stored span decoded for recording carries no RequestContext snapshot or metadata', () => {
        const stored = {
            traceId: 't',
            spanId: 's',
            parentSpanId: null,
            name: 'agent run',
            spanType: spanTypes.agentRun,
            entityId: 'rag-agent',
            startedAt: '2026-10-14T00:00:00.000Z',
            endedAt: '2026-10-14T00:00:01.000Z',
            isEvent: false,
            attributes: {},
            output: { text: 'Paris.' },
            requestContext: { scenario: { questionId: 'q', seed: 0 }, customerEmail: 'someone@example.org' },
            metadata: { runId: 'r', providerMetadata: { anthropic: { cacheCreationInputTokens: 0 } } },
        };
        const serialized = JSON.stringify(sanitizeTrace(spanRecordListSchema.parse([stored])));
        expect(serialized).not.toContain('requestContext');
        expect(serialized).not.toContain('example.org');
        expect(serialized).not.toContain('providerMetadata');
    });
});
