// The `withRagIngestion` JSDoc example passes `observabilityContext` where no API accepts
// it. TypeScript rejects the example. At runtime the documented `doc.chunk({ observabilityContext })` throws, and
// `vectorStore.upsert({ ..., observabilityContext })` is accepted and ignored: no vector-operation span is emitted.
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { fastembed } from '@mastra/fastembed';
import { LibSQLVector } from '@mastra/libsql';
import { Mastra } from '@mastra/core/mastra';
import { SpanType, withRagIngestion, type ObservabilityContext } from '@mastra/core/observability';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import { ReproSetupError } from '../shared/errors.ts';
import { flushTraces, observedStorage, requireStoredTrace } from '../shared/observed-storage.ts';
import { spansOfType } from '../shared/trace-queries.ts';

const fixtureTsconfig = fileURLToPath(new URL('./fixtures/tsconfig.json', import.meta.url));
const tscBinary = fileURLToPath(new URL('../../node_modules/.bin/tsc', import.meta.url));
const diagnosticPattern = /\((\d+),\d+\): error (TS\d+): (.*)$/;
const documentText = 'Canaries warned miners before the air turned deadly. '.repeat(12);
const chunkParameters = { strategy: 'recursive', maxSize: 120, overlap: 20 } as const;
const indexName = 'docs';

const compileJsDocExample = async (): Promise<readonly string[]> => {
    const compilerOutput = await promisify(execFile)(tscBinary, ['-p', fixtureTsconfig]).then(
        () => '',
        (failure: unknown) =>
            failure instanceof Error && 'stdout' in failure ? String(failure.stdout) : String(failure),
    );
    return compilerOutput.split('\n').flatMap((line) => {
        const match = diagnosticPattern.exec(line);
        return match === null ? [] : [`fixture line ${match[1]}: ${match[2]} ${match[3]}`];
    });
};

const { storage, observability } = observedStorage({ serviceName: 'repro-rag-ingestion' });
const mastra = new Mastra({ storage, observability });
const vectorStore = new LibSQLVector({ id: 'repro-ingestion', url: 'file::memory:' });

const documentedChunkCall = await withRagIngestion(
    { mastra, name: 'documented chunk call' },
    async (observabilityContext) => {
        const documentedParameters = { ...chunkParameters, observabilityContext };
        return MDocument.fromText(documentText).chunk(documentedParameters);
    },
).then(
    () => 'resolved',
    (error: unknown) => `threw: ${error instanceof Error ? error.message : String(error)}`,
);

const upsertAsDocumented = async (observabilityContext: ObservabilityContext) => {
    const chunks = await MDocument.fromText(documentText).chunk(chunkParameters, { observabilityContext });
    const { embeddings } = await embedMany({ model: fastembed, values: chunks.map((chunk) => chunk.text) });
    await vectorStore.createIndex({ indexName: indexName, dimension: embeddings[0]?.length ?? 0 });
    const documentedUpsert = { indexName: indexName, vectors: embeddings, observabilityContext };
    await vectorStore.upsert(documentedUpsert);
    return { chunkCount: chunks.length, vectorCount: embeddings.length };
};
const ingestion = await withRagIngestion({ mastra, name: 'documented upsert call' }, upsertAsDocumented);
await flushTraces(mastra);

const observabilityStore = await storage.getStore('observability');
const roots = await observabilityStore?.listTraces({});
const upsertRoot = roots?.spans.find((span) => span.name === 'documented upsert call');
if (upsertRoot === undefined) {
    throw new ReproSetupError('the documented upsert ingestion left no stored root span');
}
// A missing trace would read as "0 vector-operation spans", the very behaviour under test, so it must fail loudly.
const upsertTrace = await requireStoredTrace(mastra, upsertRoot.traceId);
const vectorOperationSpans = spansOfType(upsertTrace, SpanType.RAG_VECTOR_OPERATION).length;
const chunkSpans = spansOfType(upsertTrace, SpanType.RAG_ACTION).length;
const embeddingSpans = spansOfType(upsertTrace, SpanType.RAG_EMBEDDING).length;
const diagnostics = await compileJsDocExample();

await reportOutcome(
    'rag-ingestion-jsdoc',
    outcomeWhen(
        diagnostics.length > 0 && documentedChunkCall.startsWith('threw') && vectorOperationSpans === 0,
        `JSDoc example has ${diagnostics.length} type errors; its chunk call ${documentedChunkCall}; ` +
            `its upsert call is accepted and emits ${vectorOperationSpans} vector-operation spans`,
        {
            jsDocExampleTypeErrors: diagnostics,
            documentedChunkCall,
            documentedUpsert: {
                ingestion,
                chunkSpansInTrace: chunkSpans,
                embeddingSpansInTrace: embeddingSpans,
                vectorOperationSpansInTrace: vectorOperationSpans,
            },
        },
    ),
);
