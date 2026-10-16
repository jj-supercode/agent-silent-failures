import { describe, expect, test } from 'vitest';

import { pauseDelay, retryDelay } from './backoff.ts';
import { attemptNumberSchema, millisecondsSchema, type TransientFailure } from './model.ts';
import { networkPausePolicy, runRetryPolicy } from './policy.ts';

const attempt = (count: number) => attemptNumberSchema.parse(count);
const overloaded: TransientFailure = { kind: 'transient', reason: 'HTTP 529', retryAfter: null };
const lowestDraw = () => 0;
const highestDraw = () => 0.999_999;

describe('retryDelay', () => {
    test('waits between half and all of the base delay after the first attempt', () => {
        expect(retryDelay(attempt(1), overloaded, runRetryPolicy, lowestDraw)).toBe(runRetryPolicy.baseDelay / 2);
        expect(retryDelay(attempt(1), overloaded, runRetryPolicy, highestDraw)).toBeCloseTo(runRetryPolicy.baseDelay);
    });

    test('doubles with each failed attempt', () => {
        expect(retryDelay(attempt(2), overloaded, runRetryPolicy, lowestDraw)).toBe(runRetryPolicy.baseDelay);
    });

    test('never exceeds the maximum delay', () => {
        expect(retryDelay(attempt(30), overloaded, runRetryPolicy, highestDraw)).toBeLessThanOrEqual(
            runRetryPolicy.maxDelay,
        );
    });

    test('waits at least as long as the provider asked, up to the retry-after limit', () => {
        const asked = millisecondsSchema.parse(20_000);
        expect(retryDelay(attempt(1), { ...overloaded, retryAfter: asked }, runRetryPolicy, lowestDraw)).toBe(asked);
        const tooLong = millisecondsSchema.parse(runRetryPolicy.maxRetryAfter * 10);
        expect(retryDelay(attempt(1), { ...overloaded, retryAfter: tooLong }, runRetryPolicy, lowestDraw)).toBe(
            runRetryPolicy.maxRetryAfter,
        );
    });
});

describe('pauseDelay', () => {
    test('starts at the first pause and doubles', () => {
        expect(pauseDelay(0, networkPausePolicy)).toBe(networkPausePolicy.firstPause);
        expect(pauseDelay(1, networkPausePolicy)).toBe(networkPausePolicy.firstPause * 2);
    });

    test('is capped at the maximum pause', () => {
        expect(pauseDelay(20, networkPausePolicy)).toBe(networkPausePolicy.maxPause);
    });
});
