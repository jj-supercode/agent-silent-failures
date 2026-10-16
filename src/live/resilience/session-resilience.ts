import { setTimeout as delayFor } from 'node:timers/promises';

import type { RunId } from '../../bed/index.ts';
import type { NetworkOutageError } from './errors.ts';
import type { AttemptNumber, Milliseconds, NetworkPausePolicy, RetryPolicy } from './model.ts';
import { createNetworkWatch, type NetworkWatch } from './network-watch.ts';
import { networkPausePolicy, runRetryPolicy } from './policy.ts';

/** What the session tells the operator while it recovers on its own. */
export type ResilienceNotice =
    | {
          readonly kind: 'retrying';
          readonly runId: RunId;
          readonly failedAttempt: AttemptNumber;
          readonly delay: Milliseconds;
          readonly reason: string;
      }
    | {
          readonly kind: 'paused';
          readonly delay: Milliseconds;
          readonly waitedSoFar: Milliseconds;
          readonly limit: Milliseconds;
      }
    | { readonly kind: 'outage'; readonly outage: NetworkOutageError };

/** The retry and pause policies of a session, its network cell, and the clock it waits on (injected in tests). */
export type SessionResilience = {
    readonly retry: RetryPolicy;
    readonly pause: NetworkPausePolicy;
    readonly watch: NetworkWatch;
    readonly wait: (delay: Milliseconds) => Promise<void>;
    /** A number in [0, 1), for jitter. */
    readonly random: () => number;
    readonly notify: (notice: ResilienceNotice) => void;
};

export const sessionResilience = (notify: SessionResilience['notify']): SessionResilience => ({
    retry: runRetryPolicy,
    pause: networkPausePolicy,
    watch: createNetworkWatch(),
    wait: async (delay) => {
        await delayFor(delay);
    },
    random: Math.random,
    notify,
});
