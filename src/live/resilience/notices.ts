import type { Milliseconds } from './model.ts';
import type { ResilienceNotice } from './session-resilience.ts';

const inSeconds = (duration: Milliseconds): string => `${(duration / 1_000).toFixed(1)} s`;

const inMinutes = (duration: Milliseconds): string => `${(duration / 60_000).toFixed(1)} min`;

export const formatResilienceNotice = (notice: ResilienceNotice): string => {
    switch (notice.kind) {
        case 'retrying':
            return (
                `  retry ${notice.runId}: attempt ${notice.failedAttempt} failed (${notice.reason}); ` +
                `attempt ${notice.failedAttempt + 1} in ${inSeconds(notice.delay)}`
            );
        case 'paused':
            return (
                `waiting for the network: pausing ${inSeconds(notice.delay)} before the next attempt ` +
                `(${inMinutes(notice.waitedSoFar)} of ${inMinutes(notice.limit)} waited in this outage)`
            );
        case 'outage':
            return `network outage: ${notice.outage.message}`;
        default:
            return notice satisfies never;
    }
};
