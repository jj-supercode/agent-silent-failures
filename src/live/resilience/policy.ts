import { attemptNumberSchema, millisecondsSchema, type NetworkPausePolicy, type RetryPolicy } from './model.ts';

const seconds = (count: number) => millisecondsSchema.parse(count * 1_000);
const minutes = (count: number) => seconds(count * 60);

/** Three attempts per run, two to four seconds apart: enough for a dropped connection or a short overload. */
export const runRetryPolicy = {
    maxAttempts: attemptNumberSchema.parse(3),
    baseDelay: seconds(2),
    maxDelay: seconds(30),
    maxRetryAfter: minutes(5),
} as const satisfies RetryPolicy;

/**
 * Three transient failures in a row look like an outage rather than a blip: the session pauses before each further
 * attempt, 30 seconds and doubling up to 5 minutes, and stops after waiting out one outage for 30 minutes.
 */
export const networkPausePolicy = {
    failuresBeforePause: 3,
    firstPause: seconds(30),
    maxPause: minutes(5),
    maxOutageWait: minutes(30),
} as const satisfies NetworkPausePolicy;
