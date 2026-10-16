import { APICallError, type LanguageModelV4, type LanguageModelV4Middleware } from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';

import type { BudgetKey } from './budget/model.ts';
import { millisecondsSchema, type Milliseconds } from './resilience/model.ts';
import { createNetworkWatch } from './resilience/network-watch.ts';
import { networkPausePolicy, runRetryPolicy } from './resilience/policy.ts';
import type { ResilienceNotice, SessionResilience } from './resilience/session-resilience.ts';
import { currentRunScope } from './run-scope.ts';
import type { SessionModels } from './session-models.ts';

/** Test support for the live path: provider failures injected into the dry-run model, and a clock that never waits. */

const providerUrl = 'https://api.anthropic.com/v1/messages';

export const overloadedError = (): APICallError =>
    new APICallError({
        message: 'Overloaded',
        url: providerUrl,
        requestBodyValues: {},
        statusCode: 529,
        isRetryable: true,
    });

export const badRequestError = (): APICallError =>
    new APICallError({
        message: 'messages: at least one message is required',
        url: providerUrl,
        requestBodyValues: {},
        statusCode: 400,
        isRetryable: false,
    });

/** What the AI SDK throws when the machine is offline: a retryable call error without a status, DNS failure inside. */
export const offlineError = (): APICallError =>
    new APICallError({
        message: 'Cannot connect to API: getaddrinfo ENOTFOUND api.anthropic.com',
        url: providerUrl,
        requestBodyValues: {},
        isRetryable: true,
        cause: Object.assign(new Error('getaddrinfo ENOTFOUND api.anthropic.com'), { code: 'ENOTFOUND' }),
    });

/** One model call as the provider would see it: the budget it charges and its index among that budget's calls. */
export type ProviderCall = {
    readonly runKey: BudgetKey;
    readonly callIndex: number;
    readonly sessionCallIndex: number;
};

/** Decides whether a call fails, and how: `null` lets it through to the scripted model. */
export type FailureSchedule = (call: ProviderCall) => Error | null;

/** Every call the "provider" received, failed ones included, in order. */
export type ProviderCallLog = { readonly calls: () => readonly ProviderCall[] };

const injectedFailures = (schedule: FailureSchedule, received: (call: ProviderCall) => void) => {
    let sessionCallIndex = 0;
    const callsPerKey = new Map<BudgetKey, number>();
    const nextCall = (): ProviderCall => {
        const runKey = currentRunScope()?.budget.runKey;
        if (runKey === undefined) {
            throw new Error('an injected-failure model was called outside a run scope');
        }
        const callIndex = callsPerKey.get(runKey) ?? 0;
        callsPerKey.set(runKey, callIndex + 1);
        const call = { runKey, callIndex, sessionCallIndex };
        sessionCallIndex += 1;
        received(call);
        return call;
    };
    const failIfScheduled = (call: ProviderCall): void => {
        const failure = schedule(call);
        if (failure !== null) {
            throw failure;
        }
    };
    return {
        specificationVersion: 'v4',
        wrapGenerate: ({ doGenerate }) => {
            failIfScheduled(nextCall());
            return doGenerate();
        },
        wrapStream: ({ doStream }) => {
            failIfScheduled(nextCall());
            return doStream();
        },
    } satisfies LanguageModelV4Middleware;
};

/**
 * The session's agent model with failures injected where a real provider would raise them, below the failure observer
 * and the budget guard. The log lists every call that reached the "provider".
 */
export const withInjectedFailures = (
    models: SessionModels,
    schedule: FailureSchedule,
): { readonly models: SessionModels; readonly log: ProviderCallLog } => {
    let calls: readonly ProviderCall[] = [];
    const middleware = injectedFailures(schedule, (call) => {
        calls = [...calls, call];
    });
    return {
        models: {
            ...models,
            agentModelFor: (config): LanguageModelV4 =>
                wrapLanguageModel({ model: models.agentModelFor(config), middleware }),
        },
        log: { calls: () => calls },
    };
};

/** The live retry and pause policies on a clock that only records its waits; notices are collected too. */
export const instantResilience = (
    overrides: Partial<Pick<SessionResilience, 'retry' | 'pause'>> = {},
): {
    readonly resilience: SessionResilience;
    readonly waits: () => readonly Milliseconds[];
    readonly notices: () => readonly ResilienceNotice[];
} => {
    let waits: readonly Milliseconds[] = [];
    let notices: readonly ResilienceNotice[] = [];
    return {
        resilience: {
            retry: overrides.retry ?? runRetryPolicy,
            pause: overrides.pause ?? networkPausePolicy,
            watch: createNetworkWatch(),
            wait: (delay) => {
                waits = [...waits, millisecondsSchema.parse(delay)];
                return Promise.resolve();
            },
            random: () => 0.5,
            notify: (notice) => {
                notices = [...notices, notice];
            },
        },
        waits: () => waits,
        notices: () => notices,
    };
};
