import { describe, expect, test } from 'vitest';

import { NetworkOutageError } from './errors.ts';
import { millisecondsSchema } from './model.ts';
import { afterAttempt, afterOutage, afterPause, calmNetwork, gateBeforeAttempt } from './network-watch.ts';
import { networkPausePolicy } from './policy.ts';

const failedTransiently = (times: number) =>
    Array.from({ length: times }).reduce((state: typeof calmNetwork) => afterAttempt(state, true), calmNetwork);

describe('gateBeforeAttempt', () => {
    test('lets attempts through until the failures in a row reach the pause threshold', () => {
        expect(
            gateBeforeAttempt(failedTransiently(networkPausePolicy.failuresBeforePause - 1), networkPausePolicy),
        ).toEqual({
            kind: 'open',
        });
    });

    test('pauses once the threshold is reached, longer with each pause of the same outage', () => {
        const down = failedTransiently(networkPausePolicy.failuresBeforePause);
        const first = gateBeforeAttempt(down, networkPausePolicy);
        expect(first).toMatchObject({ kind: 'pause', delay: networkPausePolicy.firstPause });
        const second = gateBeforeAttempt(afterPause(down, networkPausePolicy.firstPause), networkPausePolicy);
        expect(second).toMatchObject({ kind: 'pause', delay: networkPausePolicy.firstPause * 2 });
    });

    test('closes the session once the next pause would pass the outage limit', () => {
        const waitedNearlyAll = afterPause(
            failedTransiently(networkPausePolicy.failuresBeforePause),
            millisecondsSchema.parse(networkPausePolicy.maxOutageWait - 1),
        );
        expect(gateBeforeAttempt(waitedNearlyAll, networkPausePolicy).kind).toBe('closed');
    });

    test('stays closed after an outage', () => {
        const closed = afterOutage(calmNetwork, new NetworkOutageError(networkPausePolicy.maxOutageWait, 9));
        expect(gateBeforeAttempt(closed, networkPausePolicy).kind).toBe('closed');
    });
});

describe('afterAttempt', () => {
    test('an attempt that did not fail transiently ends the outage but keeps the session total', () => {
        const paused = afterPause(
            failedTransiently(networkPausePolicy.failuresBeforePause),
            networkPausePolicy.firstPause,
        );
        const recovered = afterAttempt(paused, false);
        expect(recovered).toMatchObject({ consecutiveTransientFailures: 0, outagePauses: 0, outageWaited: 0 });
        expect(recovered.totalPaused).toBe(networkPausePolicy.firstPause);
        expect(gateBeforeAttempt(recovered, networkPausePolicy).kind).toBe('open');
    });
});
