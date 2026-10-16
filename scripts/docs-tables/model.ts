import { z } from 'zod';

import { runSourceSchema, type StoredBedReport } from '../../src/bed/index.ts';

/**
 * The parts of the generated result files the docs quote. The bed reports (`results/offline/report.json`,
 * `results/replay/report.json`) are read with the bed's own `storedBedReportSchema`; the schemas here mirror the
 * replay summary and the repro reports. Unknown fields are ignored, missing ones fail loudly.
 */
const shareSchema = z.number().min(0).max(1);

export type BedReport = StoredBedReport;
export type SplitReport = StoredBedReport['splits'][number];
export type DetectorReport = SplitReport['detectors'][number];
export type SeverityCatch = DetectorReport['caughtBySeverity'][number];
export type ReportProvenance = StoredBedReport['provenance'];
export type { FaultCatch, Rate } from '../../src/bed/index.ts';

/** `results/replay/replay.json`. */
export const replaySummarySchema = z.object({
    fixture: z.string(),
    source: runSourceSchema,
    manifest: z.object({
        mode: z.enum(['live', 'dry-run']),
        recordedOn: z.string(),
        models: z.object({ agent: z.string(), judge: z.string().nullable() }),
        platform: z.object({ os: z.string(), arch: z.string(), node: z.string() }),
        plannedRuns: z.number().int().min(0),
        recordedRuns: z.number().int().min(0),
        failedRuns: z.number().int().min(0),
    }),
    scoredRuns: z.number().int().min(0),
    unscorable: z.array(z.unknown()),
});
export type ReplaySummary = z.infer<typeof replaySummarySchema>;

/** Every `results/repros/<id>.json`, before its evidence is read. */
export const reproReportSchema = z.object({
    reproductionId: z.string(),
    outcome: z.enum(['reproduces', 'not-reproduced']),
    summary: z.string(),
    source: z.literal('scripted'),
    platform: z.string(),
    generatedOn: z.string(),
    versions: z.record(z.string(), z.string()),
    evidence: z.unknown(),
});
export type ReproReport = z.infer<typeof reproReportSchema>;

/** A Wilson-interval proportion as the repros write it. */
export const proportionSchema = z.object({
    successes: z.number().int().min(0),
    trials: z.number().int().min(0),
    rate: shareSchema,
    low: shareSchema,
    high: shareSchema,
});
export type Proportion = z.infer<typeof proportionSchema>;

const distributionSchema = z.object({
    count: z.number(),
    min: z.number(),
    median: z.number(),
    max: z.number(),
    mean: z.number(),
});

const overflowSummarySchema = z.object({
    chunkCount: z.number().int().min(0),
    overflowingCount: z.number().int().min(0),
    tokensBeyondWindowShare: shareSchema,
    bgeContentTokens: distributionSchema,
});

export const bookTruncationEvidenceSchema = z.object({
    corpusCharacters: z.number().int(),
    window: z.object({ tokens: z.number().int().positive(), contentTokens: z.number().int().positive() }),
    defaultChunks: z.object({
        count: z.number().int(),
        characters: distributionSchema,
        bgeContentTokens: distributionSchema,
        overflowingCount: z.number().int(),
        neverEmbeddedCharacterShareOfCorpus: shareSchema,
        neverEmbeddedCharacterShareOfOverflowingChunk: distributionSchema,
    }),
    cutPointCheck: z.object({ cosineFullChunkVsPrefixPlusUnrelatedTail: z.number() }),
    fittingControl: z.object({
        maxSize: z.number().int().positive(),
        count: z.number().int(),
        bgeContentTokens: distributionSchema,
        overflowingCount: z.number().int(),
    }),
    retrieval: z.object({
        topK: z.number().int(),
        defaultChunksHeadSentences: z.object({ hitAtTopK: proportionSchema }),
        defaultChunksTailSentences: z.object({ hitAtTopK: proportionSchema }),
        fittingChunksSameTailSentences: z.object({ hitAtTopK: proportionSchema }),
    }),
});
export type BookTruncationEvidence = z.infer<typeof bookTruncationEvidenceSchema>;

export const corpusTruncationEvidenceSchema = z.object({
    questionLevel: z.object({ documentCharacters: distributionSchema, defaultChunks: overflowSummarySchema }),
    paragraphLevel: z.object({ documentCharacters: distributionSchema, defaultChunks: overflowSummarySchema }),
    lengthBoundary: z.object({
        shortestDocumentWithAnOverflowingChunk: z.number().int(),
        longestDocumentWithoutOverflow: z.number().int(),
    }),
});
export type CorpusTruncationEvidence = z.infer<typeof corpusTruncationEvidenceSchema>;

export const memoryTruncationEvidenceSchema = z.object({
    recallTopK: z.number().int(),
    queriesFromEmbeddedRegion: proportionSchema,
    queriesFromNeverEmbeddedRegion: proportionSchema,
});
export type MemoryTruncationEvidence = z.infer<typeof memoryTruncationEvidenceSchema>;
