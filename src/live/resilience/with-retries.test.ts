import { describe, expect, test } from 'vitest';

import { runIdSchema } from '../../bed/index.ts';
import { instantResilience } from '../testing.ts';
import { millisecondsSchema, type AttemptNumber, type ProviderFailure } from './model.ts';
import { networkPausePolicy, runRetryPolicy } from './policy.ts';
import { withRetries, type AttemptOutcome } from './with-retries.ts';

const runId = runIdSchema.parse('held-out/h1/clean/baseline/q/r0');
const answer = 'recorded trace';
const overloaded: ProviderFailure = { kind: 'transient', reason: 'HTTP 529: Overloaded', retryAfter: null };
const badRequest: ProviderFailure = { kind: 'permanent', reason: 'HTTP 400: bad request' };

type Step = ProviderFailure | 'ok';

/** An attempt function that plays the given steps in order and records which attempt numbers it was called with. */
const scripted = (steps: readonly Step[]) => {
    let calls: readonly AttemptNumber[] = [];
    const attempt = (attemptNumber: AttemptNumber): Promise<AttemptOutcome<string>> => {
        calls = [...calls, attemptNumber];
        const step = steps[calls.length - 1] ?? 'ok';
        return Promise.resolve(
            step === 'ok' ? { kind: 'succeeded', value: answer } : { kind: 'failed', failure: step },
        );
    };
    return { attempt, calls: () => calls };
};

const notStopped = () => false;

describe('withRetries', () => {
    test('a run that succeeds first time is attempted once and reports no transient failure', async () => {
        const { resilience, waits } = instantResilience();
        const run = scripted(['ok']);
        expect(await withRetries(run.attempt, { runId, resilience, sessionStopped: notStopped })).toEqual({
            kind: 'succeeded',
            value: answer,
            attempts: 1,
            transientFailures: [],
        });
        expect(waits()).toEqual([]);
    });

    test('retries transient failures with growing backoff until the run succeeds', async () => {
        const { resilience, waits, notices } = instantResilience();
        const run = scripted([overloaded, overloaded, 'ok']);
        const outcome = await withRetries(run.attempt, { runId, resilience, sessionStopped: notStopped });
        expect(outcome).toEqual({
            kind: 'succeeded',
            value: answer,
            attempts: 3,
            transientFailures: [overloaded.reason, overloaded.reason],
        });
        expect(run.calls()).toEqual([1, 2, 3]);
        const [first, second] = waits();
        expect(second).toBeGreaterThan(first ?? Number.POSITIVE_INFINITY);
        expect(notices().map((notice) => notice.kind)).toEqual(['retrying', 'retrying']);
    });

    test('never retries a permanent failure', async () => {
        const { resilience, waits } = instantResilience();
        const run = scripted([badRequest]);
        expect(await withRetries(run.attempt, { runId, resilience, sessionStopped: notStopped })).toEqual({
            kind: 'failed',
            reason: badRequest.reason,
            attempts: 1,
            transientFailures: [],
        });
        expect(waits()).toEqual([]);
    });

    test('gives up after the maximum number of attempts', async () => {
        const { resilience } = instantResilience();
        const run = scripted([overloaded, overloaded, overloaded, 'ok']);
        const outcome = await withRetries(run.attempt, { runId, resilience, sessionStopped: notStopped });
        expect(outcome).toMatchObject({ kind: 'failed', attempts: runRetryPolicy.maxAttempts });
        expect(run.calls()).toHaveLength(runRetryPolicy.maxAttempts);
    });

    test('does not retry once the session has to stop', async () => {
        const { resilience } = instantResilience();
        const run = scripted([overloaded, 'ok']);
        const outcome = await withRetries(run.attempt, { runId, resilience, sessionStopped: () => true });
        expect(outcome).toMatchObject({ kind: 'failed', attempts: 1, transientFailures: [overloaded.reason] });
    });

    test('pauses for the network once failures pile up across runs, then resumes on its own', async () => {
        const { resilience, notices } = instantResilience();
        const first = await withRetries(scripted([overloaded, overloaded, overloaded]).attempt, {
            runId,
            resilience,
            sessionStopped: notStopped,
        });
        expect(first.kind).toBe('failed');
        const second = await withRetries(scripted(['ok']).attempt, {
            runId,
            resilience,
            sessionStopped: notStopped,
        });
        expect(second.kind).toBe('succeeded');
        expect(notices().map((notice) => notice.kind)).toEqual(['retrying', 'retrying', 'paused']);
        expect(resilience.watch.read()).toMatchObject({
            consecutiveTransientFailures: 0,
            totalPaused: networkPausePolicy.firstPause,
        });
    });

    test('stops the session cleanly once an outage outlasts the wait limit', async () => {
        const shortOutageLimit = { ...networkPausePolicy, maxOutageWait: millisecondsSchema.parse(90_000) };
        const { resilience, notices } = instantResilience({ pause: shortOutageLimit });
        const down = Array.from({ length: 12 }, () => overloaded);
        const context = { runId, resilience, sessionStopped: notStopped };
        const beforeOutage = await withRetries(scripted(down).attempt, context);
        const duringOutage = await withRetries(scripted(down).attempt, context);
        const afterLimit = await withRetries(scripted(down).attempt, context);
        expect(beforeOutage).toMatchObject({ kind: 'failed', attempts: 3 });
        expect(duringOutage).toMatchObject({ kind: 'failed', attempts: 2 });
        expect(afterLimit.kind).toBe('not-attempted');
        expect(notices().filter((notice) => notice.kind === 'outage')).toHaveLength(1);
        expect(resilience.watch.read().outage).not.toBeNull();
    });
});
