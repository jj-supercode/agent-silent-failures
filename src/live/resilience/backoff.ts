import {
    millisecondsSchema,
    type AttemptNumber,
    type Milliseconds,
    type NetworkPausePolicy,
    type RetryPolicy,
    type TransientFailure,
} from './model.ts';

/**
 * The wait before retrying a run whose attempt `failedAttempt` failed transiently: exponential from `baseDelay`, capped,
 * with "equal jitter" (half fixed, half random) so it never collapses to zero, and never shorter than a `retry-after`
 * the provider asked for. `random` returns a number in [0, 1).
 */
export const retryDelay = (
    failedAttempt: AttemptNumber,
    failure: TransientFailure,
    policy: RetryPolicy,
    random: () => number,
): Milliseconds => {
    const exponential = Math.min(policy.maxDelay, policy.baseDelay * 2 ** (failedAttempt - 1));
    const jittered = exponential / 2 + (random() * exponential) / 2;
    const requested = failure.retryAfter === null ? 0 : Math.min(failure.retryAfter, policy.maxRetryAfter);
    return millisecondsSchema.parse(Math.max(jittered, requested));
};

/** The length of an outage's next pause, given how many pauses it has had: doubling from `firstPause` to `maxPause`. */
export const pauseDelay = (pausesSoFar: number, policy: NetworkPausePolicy): Milliseconds =>
    millisecondsSchema.parse(Math.min(policy.maxPause, policy.firstPause * 2 ** pausesSoFar));
