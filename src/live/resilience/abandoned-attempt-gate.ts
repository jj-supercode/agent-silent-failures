import type { LanguageModelV4Middleware } from '@ai-sdk/provider';

import { AttemptAbandonedError } from './errors.ts';
import { firstTransient, type ProviderFailureLog } from './provider-failure-log.ts';

export type AbandonedAttemptGateInput = {
    /** The failure log of the attempt the current call belongs to, or `null` outside any attempt. */
    readonly currentLog: () => ProviderFailureLog | null;
};

/**
 * An AI SDK middleware, placed outside the budget guard, that refuses every call of an attempt that has already met a
 * transient provider failure. The refusal happens before the guard reserves anything, so an abandoned call is neither
 * sent nor charged; the attempt then ends and the run-level policy retries the whole run.
 */
export const abandonedAttemptGate = ({ currentLog }: AbandonedAttemptGateInput): LanguageModelV4Middleware => {
    const refuseAbandoned = (): void => {
        const failure = firstTransient(currentLog()?.failures() ?? []);
        if (failure !== null) {
            throw new AttemptAbandonedError(failure);
        }
    };
    return {
        specificationVersion: 'v4',
        wrapGenerate: ({ doGenerate }) => {
            refuseAbandoned();
            return doGenerate();
        },
        wrapStream: ({ doStream }) => {
            refuseAbandoned();
            return doStream();
        },
    };
};
