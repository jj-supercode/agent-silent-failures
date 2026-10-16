import { tokenCountStatsSchema, type TokenCount, type TokenCountStats } from '../trace/model.ts';

/**
 * Token totals of the chunks against the embedder's input window. `counter` names the tokenizer, so the report says
 * how the counts were measured; counts must come from the embedder's own tokenizer, without its truncation.
 */
export const summarizeTokenCounts = (
    tokenCounts: readonly TokenCount[],
    limit: TokenCount,
    counter: string,
): TokenCountStats =>
    tokenCountStatsSchema.parse({
        counter,
        limit,
        totalTokens: tokenCounts.reduce((sum, count) => sum + count, 0),
        maxChunkTokens: Math.max(0, ...tokenCounts),
        overLimitCount: tokenCounts.filter((count) => count > limit).length,
        tokensBeyondLimit: tokenCounts.reduce((sum, count) => sum + Math.max(0, count - limit), 0),
    });
