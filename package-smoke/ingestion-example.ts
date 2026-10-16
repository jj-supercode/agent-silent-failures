// The embedding-coverage example: a pipeline records its own ingestion report, built by the published pure builder.
import assert from 'node:assert/strict';

import type { Mastra } from '@mastra/core/mastra';
import { withRagIngestion } from '@mastra/core/observability';
import { embeddingCoverageEntry } from 'agent-silent-failures';
import { buildIngestionReport, type CountTokens } from 'agent-silent-failures/ingestion';
import {
    charCountSchema,
    chunkCountSchema,
    modelIdSchema,
    spanIdSchema,
    tokenCountSchema,
    traceIdSchema,
} from 'agent-silent-failures/trace/model';

/** What your pipeline already has after chunking, embedding and upserting. */
export type IngestedCorpus = {
    readonly chunkTexts: readonly string[];
    readonly vectors: readonly (readonly number[])[];
    readonly documentCount: number;
    /** What the store reports, e.g. `(await vectorStore.describeIndex({ indexName })).count`. */
    readonly storedVectorCount: number;
};

const embedderWindow = tokenCountSchema.parse(512);

const reportFor = (corpus: IngestedCorpus, countTokens: CountTokens) =>
    buildIngestionReport({
        indexName: 'docs',
        embedder: { modelId: modelIdSchema.parse('bge-small-en-v1.5'), maxInputTokens: embedderWindow },
        chunking: { strategy: 'recursive', maxSize: charCountSchema.parse(4000), overlap: charCountSchema.parse(200) },
        documentCount: corpus.documentCount,
        tokenCounter: 'bge-small-en-v1.5 tokenizer.json, untruncated',
        chunkTexts: corpus.chunkTexts,
        vectors: corpus.vectors,
        countTokens,
        index: {
            upsertedCount: chunkCountSchema.parse(corpus.vectors.length),
            vectorCount: chunkCountSchema.parse(corpus.storedVectorCount),
        },
    });

/**
 * Records the report as the output of a `rag_ingestion` span, which is what the embedding-coverage scorer reads.
 * `countTokens` must count with the embedder's own tokenizer and without its truncation.
 */
export const recordIngestionReport = (mastra: Mastra, corpus: IngestedCorpus, countTokens: CountTokens) =>
    withRagIngestion({ mastra, name: 'docs ingestion', attributes: { indexName: 'docs' } }, () =>
        reportFor(corpus, countTokens),
    );

// Smoke: one chunk of 600 whitespace tokens overflows the 512-token window, so the entry fires.
const overflowingChunk = Array.from({ length: 600 }, (_, index) => `word${index}`).join(' ');
const report = await reportFor(
    {
        chunkTexts: ['a short chunk', overflowingChunk],
        vectors: [
            [1, 0],
            [0, 1],
        ],
        documentCount: 1,
        storedVectorCount: 2,
    },
    (text) => text.split(/\s+/).length,
);
const verdict = embeddingCoverageEntry.detect({
    traceId: traceIdSchema.parse('ingestion'),
    rootSpanId: spanIdSchema.parse('root'),
    report,
    chunkActions: [],
});
assert.equal(verdict.kind, 'fired');
console.log('ingestion example: buildIngestionReport feeds embedding-coverage from the built package');
