import { fastembedMaxContentTokens, specialTokensPerInput } from './bge-tokenizer.ts';
import { isOverflowing, type MeasuredChunk } from './measured-chunks.ts';
import { distributionOf, type Distribution } from './distribution.ts';
import { shareOf } from './shares.ts';

export type OverflowSummary = {
    readonly chunkCount: number;
    readonly overflowingCount: number;
    readonly overflowingShare: number;
    readonly bgeContentTokens: Distribution;
    /**
     * Tokens past the window over every token the embedder reads (special tokens included): the share of the text no
     * query can reach, counted as the ingestion trace and the `embedding-coverage` detector count it.
     */
    readonly tokensBeyondWindowShare: number;
};

const tokensBeyondWindow = (chunk: MeasuredChunk): number =>
    Math.max(0, chunk.coverage.contentTokens - fastembedMaxContentTokens);

export const overflowSummary = (chunks: readonly MeasuredChunk[]): OverflowSummary => {
    const totalTokens = chunks.reduce(
        (total, chunk) => total + chunk.coverage.contentTokens + specialTokensPerInput,
        0,
    );
    const beyondTokens = chunks.reduce((total, chunk) => total + tokensBeyondWindow(chunk), 0);
    const overflowingCount = chunks.filter(isOverflowing).length;
    return {
        chunkCount: chunks.length,
        overflowingCount,
        overflowingShare: shareOf(overflowingCount, chunks.length),
        bgeContentTokens: distributionOf(chunks.map((chunk) => chunk.coverage.contentTokens)),
        tokensBeyondWindowShare: shareOf(beyondTokens, totalTokens),
    };
};
