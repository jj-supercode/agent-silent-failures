import { describe, expect, test } from 'vitest';

import { embeddingCoverageEntry } from '../entries/index.ts';
import {
    charCountSchema,
    chunkCountSchema,
    modelIdSchema,
    spanIdSchema,
    tokenCountSchema,
    traceIdSchema,
    type IngestionReport,
} from '../trace/model.ts';
import { buildIngestionReport } from './build-ingestion-report.ts';
import type { IngestionSetup } from './model.ts';
import { summarizeIngestion } from './summarize-ingestion.ts';

const window = tokenCountSchema.parse(8);
const setup: IngestionSetup = {
    indexName: 'docs',
    embedder: { modelId: modelIdSchema.parse('sample-embedder'), maxInputTokens: window },
    chunking: {
        strategy: 'recursive',
        maxSize: charCountSchema.parse(400),
        overlap: charCountSchema.parse(0),
    },
    documentCount: 1,
    tokenCounter: 'words',
};
const shortChunk = 'three short words';
const longChunk = 'one two three four five six seven eight nine ten';
const countWords = (text: string): number => text.split(/\s+/).length;
const allStored = (count: number) => ({
    upsertedCount: chunkCountSchema.parse(count),
    vectorCount: chunkCountSchema.parse(count),
});

const verdictOn = (report: IngestionReport) =>
    embeddingCoverageEntry.detect({
        traceId: traceIdSchema.parse('trace-ingestion'),
        rootSpanId: spanIdSchema.parse('span-root'),
        report,
        chunkActions: [],
    }).kind;

describe('buildIngestionReport', () => {
    test('counts tokens with the given counter and reports chunks past the embedder window', async () => {
        const report = await buildIngestionReport({
            ...setup,
            chunkTexts: [shortChunk, longChunk],
            vectors: [
                [1, 0],
                [0, 1],
            ],
            countTokens: (text) => Promise.resolve(countWords(text)),
            index: allStored(2),
        });
        expect(report).toMatchObject({
            chunkCount: 2,
            embeddedCount: 2,
            tokenCounts: {
                counter: 'words',
                limit: window,
                maxChunkTokens: 10,
                overLimitCount: 1,
                tokensBeyondLimit: 2,
            },
        });
        expect(verdictOn(report)).toBe('fired');
    });

    test('gives a report the embedding-coverage entry reads as clear when every chunk fits and is stored', async () => {
        const report = await buildIngestionReport({
            ...setup,
            chunkTexts: [shortChunk, 'two more'],
            vectors: [
                [1, 0],
                [0, 1],
            ],
            countTokens: countWords,
            index: allStored(2),
        });
        expect(verdictOn(report)).toBe('clear');
    });
});

describe('summarizeIngestion', () => {
    test('pairs vectors with chunks by position, so a missing vector shows as an embedder shortfall', () => {
        const report = summarizeIngestion({
            ...setup,
            chunks: [
                { text: shortChunk, tokenCount: tokenCountSchema.parse(3) },
                { text: 'two more', tokenCount: tokenCountSchema.parse(2) },
            ],
            vectors: [[1, 0]],
            index: allStored(1),
        });
        expect(report).toMatchObject({ chunkCount: 2, embeddedCount: 1, upsertedCount: 1 });
        expect(verdictOn(report)).toBe('fired');
    });
});
