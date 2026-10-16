import { describe, expect, test } from 'vitest';

import { tokenCountSchema } from '../trace/model.ts';
import { summarizeTokenCounts } from './token-count-stats.ts';

const limit = tokenCountSchema.parse(512);
const underLimit = tokenCountSchema.parse(300);
const overLimit = tokenCountSchema.parse(700);

describe('summarizeTokenCounts', () => {
    test('counts chunks over the limit and the tokens the embedder never reads', () => {
        expect(summarizeTokenCounts([underLimit, overLimit, limit], limit, 'sample')).toEqual({
            counter: 'sample',
            limit,
            totalTokens: underLimit + overLimit + limit,
            maxChunkTokens: overLimit,
            overLimitCount: 1,
            tokensBeyondLimit: overLimit - limit,
        });
    });

    test('a chunk exactly at the limit is not over it', () => {
        expect(summarizeTokenCounts([limit], limit, 'sample').overLimitCount).toBe(0);
    });

    test('an empty corpus has zero everywhere', () => {
        expect(summarizeTokenCounts([], limit, 'sample')).toMatchObject({
            totalTokens: 0,
            maxChunkTokens: 0,
            overLimitCount: 0,
        });
    });
});
