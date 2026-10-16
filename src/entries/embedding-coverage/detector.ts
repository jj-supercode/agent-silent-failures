import { unitIntervalSchema, type IngestionReport, type IngestionView } from '../../trace/model.ts';
import type { Detector, EmbeddingCoverageThresholds } from './model.ts';

/** One way part of the corpus became unsearchable, with the share of the corpus it covers. */
type CoverageGap = { readonly share: number; readonly summary: string };

/** A gap needs something actually lost, whatever value a sensitivity sweep gives the threshold. */
const exceeds = (count: number, maxTolerated: number): boolean => count > 0 && count > maxTolerated;

/** Three significant digits, so a small but real loss never prints as 0.0%. */
const percent = (share: number): string => `${Number((share * 100).toPrecision(3))}%`;

/** Chunks as the RAG library itself counted them, when it recorded its chunk actions; else as the pipeline did. */
const chunkedCount = (view: IngestionView): number =>
    view.chunkActions.length === 0
        ? view.report.chunkCount
        : Math.max(
              view.report.chunkCount,
              view.chunkActions.reduce((sum, action) => sum + action.chunkCount, 0),
          );

/**
 * Fewer vectors than inputs leaves no record of which vector belongs to which chunk. A pipeline that pairs them by
 * position (as most do) indexes nearly every chunk after the first gap under another chunk's vector, so the whole
 * index is suspect, not only the missing share: measured offline, 2% of chunks still retrieved themselves.
 */
const embedderShortfallGap = (report: IngestionReport, chunked: number, maxMissing: number): CoverageGap | null => {
    const shortfall = chunked - report.embeddedCount;
    return !exceeds(shortfall, maxMissing)
        ? null
        : {
              share: 1,
              summary:
                  `the embedder returned ${report.embeddedCount} vectors for ${chunked} chunks: ${shortfall} chunks ` +
                  `have no vector, and the pairing of every other vector to its chunk can no longer be trusted`,
          };
};

/** Vectors the embedder produced that never reached the index. */
const indexShortfallGap = (report: IngestionReport, chunked: number, maxMissing: number): CoverageGap | null => {
    const embedded = Math.min(chunked, report.embeddedCount);
    const missing = Math.max(0, embedded - Math.min(report.upsertedCount, report.vectorCount));
    return !exceeds(missing, maxMissing)
        ? null
        : {
              share: missing / chunked,
              summary:
                  `${missing} of ${embedded} embedded chunks are not in the index ` +
                  `(upserted ${report.upsertedCount}, index holds ${report.vectorCount})`,
          };
};

const tokenOverflowGap = (report: IngestionReport, maxOverLimit: number): CoverageGap | null => {
    const { overLimitCount, tokensBeyondLimit, totalTokens, limit, maxChunkTokens } = report.tokenCounts;
    const truncatedTokenShare = totalTokens === 0 ? 0 : tokensBeyondLimit / totalTokens;
    return !exceeds(overLimitCount, maxOverLimit)
        ? null
        : {
              share: truncatedTokenShare,
              summary:
                  `${overLimitCount} of ${report.chunkCount} chunks exceed the ${limit}-token embedder window ` +
                  `(longest ${maxChunkTokens} tokens, chunks up to ${report.chunking.maxSize} characters): ` +
                  `${percent(truncatedTokenShare)} of chunk tokens are never embedded`,
          };
};

/**
 * Over-limit counts are only as good as the limit they were measured against. When that limit is wider than the
 * window the embedder declares, the longest chunk alone still proves an overflow the counts missed.
 */
const undercountedOverflowGap = (report: IngestionReport, maxOverLimit: number): CoverageGap | null => {
    const { limit, maxChunkTokens, totalTokens } = report.tokenCounts;
    const window = report.embedder.maxInputTokens;
    const provenOverLimitChunks = 1;
    return limit <= window || maxChunkTokens <= window || !exceeds(provenOverLimitChunks, maxOverLimit)
        ? null
        : {
              share: totalTokens === 0 ? 0 : (maxChunkTokens - window) / totalTokens,
              summary:
                  `token counts were measured against a ${limit}-token limit, but the embedder reads ${window}: ` +
                  `the longest chunk (${maxChunkTokens} tokens) overflows, so the over-limit counts are a lower bound`,
          };
};

const degenerateVectorsGap = (report: IngestionReport, chunked: number, maxDegenerate: number): CoverageGap | null => {
    const { zeroNormCount, nonFiniteCount, duplicateOfDistinctTextCount } = report.vectors;
    const degenerate = zeroNormCount + nonFiniteCount + duplicateOfDistinctTextCount;
    return !exceeds(degenerate, maxDegenerate)
        ? null
        : {
              share: degenerate / chunked,
              summary:
                  `${degenerate} vectors are degenerate (zero norm ${zeroNormCount}, non-finite ${nonFiniteCount}, ` +
                  `same vector as a different text ${duplicateOfDistinctTextCount})`,
          };
};

/**
 * Fires when part of an ingested corpus cannot be retrieved: chunks without vectors, chunks longer than the
 * embedder reads, or vectors that cannot rank. Severity is the largest share of the corpus one gap covers.
 */
export const detectEmbeddingCoverage: Detector<IngestionView, EmbeddingCoverageThresholds> = (
    view,
    { MAX_MISSING_CHUNKS, MAX_OVER_LIMIT_CHUNKS, MAX_DEGENERATE_VECTORS },
) => {
    const chunked = chunkedCount(view);
    if (chunked === 0) {
        return { kind: 'not-applicable', reason: 'the ingestion produced no chunks' };
    }
    const gaps = [
        embedderShortfallGap(view.report, chunked, MAX_MISSING_CHUNKS.value),
        indexShortfallGap(view.report, chunked, MAX_MISSING_CHUNKS.value),
        tokenOverflowGap(view.report, MAX_OVER_LIMIT_CHUNKS.value),
        undercountedOverflowGap(view.report, MAX_OVER_LIMIT_CHUNKS.value),
        degenerateVectorsGap(view.report, chunked, MAX_DEGENERATE_VECTORS.value),
    ].filter((gap) => gap !== null);
    if (gaps.length === 0) {
        return {
            kind: 'clear',
            evidence: {
                summary:
                    `all ${chunked} chunks are indexed, fit the ${view.report.embedder.maxInputTokens}-token window ` +
                    `(longest ${view.report.tokenCounts.maxChunkTokens}) and have distinct, finite vectors`,
            },
        };
    }
    return {
        kind: 'fired',
        severity: unitIntervalSchema.parse(Math.min(1, Math.max(...gaps.map((gap) => gap.share)))),
        evidence: {
            spanIds: [view.rootSpanId, ...view.chunkActions.map((action) => action.spanId)],
            summary: gaps.map((gap) => gap.summary).join('; '),
        },
    };
};
