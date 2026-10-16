import type { Milliseconds, TransientFailure } from './model.ts';

/**
 * Takes the place of a transient provider error on its way into the agent framework, so that every retry belongs to
 * the run-level policy, which backs off, counts attempts and starts the whole run again. The original error is kept
 * as `providerError`, deliberately not as `cause`: Mastra 1.77 retries a model call whose `cause` chain holds a
 * retryable `APICallError` (`getRetryAfterMs` and the stream-error retry walk the chain), and the AI SDK retries the
 * `APICallError` itself.
 */
export class TransientProviderError extends Error {
    override readonly name = 'TransientProviderError';
    readonly failure: TransientFailure;
    readonly providerError: unknown;

    constructor(failure: TransientFailure, providerError: unknown) {
        super(`transient provider failure: ${failure.reason}`);
        this.failure = failure;
        this.providerError = providerError;
    }
}

/** Ends a session whose network stayed down past the outage limit; what was recorded stays replayable. */
export class NetworkOutageError extends Error {
    override readonly name = 'NetworkOutageError';

    constructor(waited: Milliseconds, consecutiveFailures: number) {
        super(
            `the provider stayed unreachable after ${consecutiveFailures} transient failures in a row and ` +
                `${Math.round(waited / 60_000)} minutes of waiting; resume the recording later with --resume`,
        );
    }
}

/**
 * Thrown instead of sending a call once its attempt has already failed transiently: a supervisor goes on after a
 * worker's swallowed failure, but the attempt will be discarded and retried, so its later calls would be paid for
 * nothing. Not an `APICallError` and without a `cause`, so the framework does not retry it either.
 */
export class AttemptAbandonedError extends Error {
    override readonly name = 'AttemptAbandonedError';

    constructor(failure: TransientFailure) {
        super(`the attempt already failed transiently (${failure.reason}); no further call is sent for it`);
    }
}
