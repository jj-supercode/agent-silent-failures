import { pauseDelay } from './backoff.ts';
import { NetworkOutageError } from './errors.ts';
import { millisecondsSchema, type Milliseconds, type NetworkPausePolicy } from './model.ts';

/** What the session knows about the network, across runs. */
export type NetworkWatchState = {
    readonly consecutiveTransientFailures: number;
    /** Pauses of the current outage; an attempt that does not fail transiently ends the outage. */
    readonly outagePauses: number;
    readonly outageWaited: Milliseconds;
    /** Every pause of the session, for the session record. */
    readonly totalPaused: Milliseconds;
    /** Set once an outage outlasts the limit: the session stops before its next attempt. */
    readonly outage: NetworkOutageError | null;
};

export const calmNetwork: NetworkWatchState = {
    consecutiveTransientFailures: 0,
    outagePauses: 0,
    outageWaited: millisecondsSchema.parse(0),
    totalPaused: millisecondsSchema.parse(0),
    outage: null,
};

/** What to do before the next attempt. */
export type NetworkGate =
    | { readonly kind: 'open' }
    | { readonly kind: 'pause'; readonly delay: Milliseconds; readonly waitedSoFar: Milliseconds }
    | { readonly kind: 'closed'; readonly outage: NetworkOutageError };

export const gateBeforeAttempt = (state: NetworkWatchState, policy: NetworkPausePolicy): NetworkGate => {
    if (state.outage !== null) {
        return { kind: 'closed', outage: state.outage };
    }
    if (state.consecutiveTransientFailures < policy.failuresBeforePause) {
        return { kind: 'open' };
    }
    const delay = pauseDelay(state.outagePauses, policy);
    return state.outageWaited + delay > policy.maxOutageWait
        ? { kind: 'closed', outage: new NetworkOutageError(state.outageWaited, state.consecutiveTransientFailures) }
        : { kind: 'pause', delay, waitedSoFar: state.outageWaited };
};

/** Any attempt that did not fail transiently proves the provider reachable and ends the outage. */
export const afterAttempt = (state: NetworkWatchState, failedTransiently: boolean): NetworkWatchState =>
    failedTransiently
        ? { ...state, consecutiveTransientFailures: state.consecutiveTransientFailures + 1 }
        : {
              ...state,
              consecutiveTransientFailures: 0,
              outagePauses: 0,
              outageWaited: millisecondsSchema.parse(0),
          };

export const afterPause = (state: NetworkWatchState, delay: Milliseconds): NetworkWatchState => ({
    ...state,
    outagePauses: state.outagePauses + 1,
    outageWaited: millisecondsSchema.parse(state.outageWaited + delay),
    totalPaused: millisecondsSchema.parse(state.totalPaused + delay),
});

export const afterOutage = (state: NetworkWatchState, outage: NetworkOutageError): NetworkWatchState => ({
    ...state,
    outage: state.outage ?? outage,
});

/** The session's one network cell; every run reads and advances it. */
export type NetworkWatch = {
    readonly read: () => NetworkWatchState;
    readonly update: (transition: (state: NetworkWatchState) => NetworkWatchState) => void;
};

export const createNetworkWatch = (): NetworkWatch => {
    let state = calmNetwork;
    return {
        read: () => state,
        update: (transition) => {
            state = transition(state);
        },
    };
};
