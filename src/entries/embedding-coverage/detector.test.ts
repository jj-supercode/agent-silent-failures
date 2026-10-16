import { describe, expect, test } from 'vitest';

import {
    chunkCountSchema,
    ingestionReportSchema,
    spanIdSchema,
    traceIdSchema,
    type ChunkAction,
    type IngestionReport,
    type IngestionView,
} from '../../trace/index.ts';
import { detectEmbeddingCoverage } from './detector.ts';
import { embeddingCoverageEntry } from './entry.ts';
import { embeddingCoverageThresholds } from './model.ts';

const chunkCount = 80;
const windowTokens = 512;
const tokensPerCleanChunk = 200;
const degenerateVectors = chunkCount / 10;
const longestOverflowingChunk = windowTokens + 388;
const extraChunkerChunks = 5;

const cleanReport: IngestionReport = ingestionReportSchema.parse({
    indexName: 'corpus',
    embedder: { modelId: 'bge-small-en-v1.5', maxInputTokens: windowTokens },
    chunking: { strategy: 'recursive', maxSize: 1000, overlap: 100 },
    documentCount: 40,
    chunkCount,
    embeddedCount: chunkCount,
    upsertedCount: chunkCount,
    vectorCount: chunkCount,
    tokenCounts: {
        counter: 'bge-small-en-v1.5 tokenizer.json',
        limit: windowTokens,
        totalTokens: chunkCount * tokensPerCleanChunk,
        maxChunkTokens: tokensPerCleanChunk,
        overLimitCount: 0,
        tokensBeyondLimit: 0,
    },
    vectors: { zeroNormCount: 0, nonFiniteCount: 0, duplicateOfDistinctTextCount: 0 },
});

const chunkAction = (count: number): ChunkAction => ({
    spanId: spanIdSchema.parse('span-chunk'),
    strategy: 'recursive',
    maxSize: cleanReport.chunking.maxSize,
    overlap: cleanReport.chunking.overlap,
    chunkCount: chunkCountSchema.parse(count),
});

const ingestionView = (
    changes: (report: IngestionReport) => unknown,
    chunkActions: readonly ChunkAction[] = [chunkAction(chunkCount)],
): IngestionView => ({
    traceId: traceIdSchema.parse('trace-ingestion'),
    rootSpanId: spanIdSchema.parse('span-root'),
    report: ingestionReportSchema.parse(changes(cleanReport)),
    chunkActions,
});

const detect = (view: IngestionView) => detectEmbeddingCoverage(view, embeddingCoverageThresholds);

describe('embedding-coverage detector', () => {
    test('is clear when every chunk is indexed, fits the window and has a sound vector', () => {
        expect(detect(ingestionView((report) => report)).kind).toBe('clear');
    });

    test('fires on token overflow with the share of tokens past the window as severity', () => {
        const overLimitChunks = 60;
        const tokensBeyondLimit = 4000;
        const verdict = detect(
            ingestionView((report) => ({
                ...report,
                tokenCounts: {
                    ...report.tokenCounts,
                    overLimitCount: overLimitChunks,
                    tokensBeyondLimit,
                    maxChunkTokens: longestOverflowingChunk,
                },
            })),
        );
        expect(verdict).toMatchObject({
            kind: 'fired',
            severity: tokensBeyondLimit / cleanReport.tokenCounts.totalTokens,
        });
        expect(verdict.kind === 'fired' ? verdict.evidence.summary : '').toContain(
            `${overLimitChunks} of ${chunkCount} chunks exceed`,
        );
    });

    test('fires when tokens were counted against a wider limit than the embedder window and a chunk exceeds it', () => {
        const declaredWindow = 256;
        const verdict = detect(
            ingestionView((report) => ({
                ...report,
                embedder: { ...report.embedder, maxInputTokens: declaredWindow },
                tokenCounts: { ...report.tokenCounts, maxChunkTokens: declaredWindow + 1 },
            })),
        );
        expect(verdict.kind === 'fired' ? verdict.evidence.summary : '').toContain(
            'over-limit counts are a lower bound',
        );
    });

    test('a wider counting limit alone is not a failure while every chunk fits the embedder window', () => {
        const verdict = detect(
            ingestionView((report) => ({
                ...report,
                embedder: { ...report.embedder, maxInputTokens: tokensPerCleanChunk },
            })),
        );
        expect(verdict.kind).toBe('clear');
    });

    test('an embedder that returns fewer vectors than chunks fires with full severity: no pairing can be trusted', () => {
        const embedded = 70;
        const verdict = detect(
            ingestionView((report) => ({
                ...report,
                embeddedCount: embedded,
                upsertedCount: embedded,
                vectorCount: embedded,
            })),
        );
        expect(verdict).toMatchObject({ kind: 'fired', severity: 1 });
        expect(verdict.kind === 'fired' ? verdict.evidence.summary : '').toMatch(
            /have no vector, and the pairing of every other vector to its chunk can no longer be trusted$/,
        );
    });

    test('vectors lost between embedding and the index fire with their share of the corpus', () => {
        const upserted = 70;
        const verdict = detect(
            ingestionView((report) => ({ ...report, upsertedCount: upserted, vectorCount: upserted })),
        );
        expect(verdict).toMatchObject({ kind: 'fired', severity: (chunkCount - upserted) / chunkCount });
    });

    test('fires when the index holds fewer rows than were upserted', () => {
        expect(detect(ingestionView((report) => ({ ...report, vectorCount: chunkCount - 1 }))).kind).toBe('fired');
    });

    test('fires when the chunker recorded more chunks than the pipeline reports', () => {
        expect(detect(ingestionView((report) => report, [chunkAction(chunkCount + extraChunkerChunks)])).kind).toBe(
            'fired',
        );
    });

    test.each([
        ['zero-norm', { zeroNormCount: degenerateVectors, nonFiniteCount: 0, duplicateOfDistinctTextCount: 0 }],
        ['non-finite', { zeroNormCount: 0, nonFiniteCount: degenerateVectors, duplicateOfDistinctTextCount: 0 }],
        ['duplicated', { zeroNormCount: 0, nonFiniteCount: 0, duplicateOfDistinctTextCount: degenerateVectors }],
    ])('fires on %s vectors with their share of the corpus as severity', (_label, vectors) => {
        expect(detect(ingestionView((report) => ({ ...report, vectors })))).toMatchObject({
            kind: 'fired',
            severity: degenerateVectors / chunkCount,
        });
    });

    test('severity is the largest gap when several fire, and the summary names each', () => {
        const verdict = detect(
            ingestionView((report) => ({
                ...report,
                upsertedCount: chunkCount / 2,
                vectors: { ...report.vectors, zeroNormCount: 1 },
            })),
        );
        expect(verdict).toMatchObject({ kind: 'fired', severity: chunkCount / 2 / chunkCount });
        expect(verdict.kind === 'fired' ? verdict.evidence.summary.split('; ') : []).toHaveLength(2);
    });

    test('a clean ingestion stays clear even with every threshold swept below zero', () => {
        const sweptBelowZero = { MAX_MISSING_CHUNKS: -1, MAX_OVER_LIMIT_CHUNKS: -1, MAX_DEGENERATE_VECTORS: -1 };
        expect(
            embeddingCoverageEntry.detect(
                ingestionView((report) => report),
                sweptBelowZero,
            ).kind,
        ).toBe('clear');
    });

    test('an ingestion without chunks is not applicable', () => {
        const empty = (report: IngestionReport) => ({
            ...report,
            chunkCount: 0,
            embeddedCount: 0,
            upsertedCount: 0,
            vectorCount: 0,
            tokenCounts: { ...report.tokenCounts, totalTokens: 0, maxChunkTokens: 0 },
        });
        expect(detect(ingestionView(empty, [])).kind).toBe('not-applicable');
    });
});
