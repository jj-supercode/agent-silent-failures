import type { RunId } from '../../bed/index.ts';
import { retryDelay } from './backoff.ts';
import type { NetworkOutageError } from './errors.ts';
import { attemptNumberSchema, firstAttempt, type AttemptNumber, type ProviderFailure } from './model.ts';
import { afterAttempt, afterOutage, afterPause, gateBeforeAttempt } from './network-watch.ts';
import type { SessionResilience } from './session-resilience.ts';

export type AttemptOutcome<T> =
    { readonly kind: 'succeeded'; readonly value: T } | { readonly kind: 'failed'; readonly failure: ProviderFailure };

/** How a run ended after its attempts; `transientFailures` lists every transient reason met on the way. */
export type RetriedOutcome<T> =
    | {
          readonly kind: 'succeeded';
          readonly value: T;
          readonly attempts: AttemptNumber;
          readonly transientFailures: readonly string[];
      }
    | {
          readonly kind: 'failed';
          readonly reason: string;
          readonly attempts: AttemptNumber;
          readonly transientFailures: readonly string[];
      }
    | { readonly kind: 'not-attempted'; readonly outage: NetworkOutageError };

export type RetryContext = {
    readonly runId: RunId;
    readonly resilience: SessionResilience;
    /** True once the session must stop (budget cap, outage): a transient failure is then not retried. */
    readonly sessionStopped: () => boolean;
};

/** Pauses first when the network looks down; returns the outage that closes the session, or `null` to go ahead. */
const passNetworkGate = async ({
    watch,
    pause,
    wait,
    notify,
}: SessionResilience): Promise<NetworkOutageError | null> => {
    const gate = gateBeforeAttempt(watch.read(), pause);
    switch (gate.kind) {
        case 'open':
            return null;
        case 'pause':
            notify({ kind: 'paused', delay: gate.delay, waitedSoFar: gate.waitedSoFar, limit: pause.maxOutageWait });
            await wait(gate.delay);
            watch.update((state) => afterPause(state, gate.delay));
            return null;
        case 'closed':
            if (watch.read().outage === null) {
                notify({ kind: 'outage', outage: gate.outage });
            }
            watch.update((state) => afterOutage(state, gate.outage));
            return gate.outage;
        default:
            return gate satisfies never;
    }
};

/**
 * Runs `attempt` until it succeeds, fails permanently, or has failed transiently `maxAttempts` times, backing off
 * between attempts and pausing while the network is down. Only a transient failure is retried; every attempt is a
 * fresh, separately paid try of the whole run.
 */
export const withRetries = <T>(
    attempt: (attemptNumber: AttemptNumber) => Promise<AttemptOutcome<T>>,
    { runId, resilience, sessionStopped }: RetryContext,
): Promise<RetriedOutcome<T>> => {
    const attemptFrom = async (
        attemptNumber: AttemptNumber,
        transientFailures: readonly string[],
    ): Promise<RetriedOutcome<T>> => {
        const outage = await passNetworkGate(resilience);
        if (outage !== null) {
            return attemptNumber === firstAttempt
                ? { kind: 'not-attempted', outage }
                : {
                      kind: 'failed',
                      reason: outage.message,
                      attempts: attemptNumberSchema.parse(attemptNumber - 1),
                      transientFailures,
                  };
        }
        const outcome = await attempt(attemptNumber);
        resilience.watch.update((state) =>
            afterAttempt(state, outcome.kind === 'failed' && outcome.failure.kind === 'transient'),
        );
        if (outcome.kind === 'succeeded') {
            return { kind: 'succeeded', value: outcome.value, attempts: attemptNumber, transientFailures };
        }
        const { failure } = outcome;
        if (failure.kind === 'permanent') {
            return { kind: 'failed', reason: failure.reason, attempts: attemptNumber, transientFailures };
        }
        const failures = [...transientFailures, failure.reason];
        if (attemptNumber >= resilience.retry.maxAttempts || sessionStopped()) {
            return {
                kind: 'failed',
                reason: `${failure.reason} (transient, given up after ${attemptNumber} attempts)`,
                attempts: attemptNumber,
                transientFailures: failures,
            };
        }
        const delay = retryDelay(attemptNumber, failure, resilience.retry, resilience.random);
        resilience.notify({ kind: 'retrying', runId, failedAttempt: attemptNumber, delay, reason: failure.reason });
        await resilience.wait(delay);
        return attemptFrom(attemptNumberSchema.parse(attemptNumber + 1), failures);
    };
    return attemptFrom(firstAttempt, []);
};
