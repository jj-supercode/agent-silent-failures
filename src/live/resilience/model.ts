import { z } from 'zod';

import { runIdSchema } from '../../bed/index.ts';

/** A duration in milliseconds: retry backoffs, network pauses and time spent waiting for the network. */
export const millisecondsSchema = z.number().nonnegative().brand<'Milliseconds'>();
export type Milliseconds = z.infer<typeof millisecondsSchema>;

/** Which try of one run this is, counting from 1. */
export const attemptNumberSchema = z.int().positive().brand<'AttemptNumber'>();
export type AttemptNumber = z.infer<typeof attemptNumberSchema>;

export const firstAttempt = attemptNumberSchema.parse(1);

/** A failure worth retrying: the request may well succeed if sent again (an outage, an overload, a rate limit). */
export type TransientFailure = {
    readonly kind: 'transient';
    readonly reason: string;
    /** How long the provider asked the client to wait (`retry-after`), or `null` when it did not say. */
    readonly retryAfter: Milliseconds | null;
};

/** A failure that sending the same request again cannot fix: a request error, a refused key, a guard refusal. */
export type PermanentFailure = {
    readonly kind: 'permanent';
    readonly reason: string;
};

export type ProviderFailure = TransientFailure | PermanentFailure;

export type RetryPolicy = {
    readonly maxAttempts: AttemptNumber;
    /** The backoff before the second attempt; each later one doubles it, up to `maxDelay`. */
    readonly baseDelay: Milliseconds;
    readonly maxDelay: Milliseconds;
    /** A provider's `retry-after` is honoured up to this long. */
    readonly maxRetryAfter: Milliseconds;
};

export type NetworkPausePolicy = {
    /** Consecutive transient failures, across runs, after which the session pauses before every further attempt. */
    readonly failuresBeforePause: number;
    readonly firstPause: Milliseconds;
    /** Each pause of one outage doubles the previous one, up to this. */
    readonly maxPause: Milliseconds;
    /** The session stops, still replayable and resumable, once one outage has been waited out this long. */
    readonly maxOutageWait: Milliseconds;
};

/** A run that needed more than one attempt or met a transient failure: kept in `spend.json`, every attempt paid for. */
export const retriedRunSchema = z.object({
    runId: runIdSchema,
    attempts: attemptNumberSchema,
    transientFailures: z.array(z.string()).readonly(),
    outcome: z.enum(['completed', 'failed']),
});
export type RetriedRun = z.infer<typeof retriedRunSchema>;
