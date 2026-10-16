import { AsyncLocalStorage } from 'node:async_hooks';

import type { ScenarioContext } from '../harness/index.ts';
import type { RunBudgetScope } from './budget/spend-ledger.ts';
import type { ProviderFailureLog } from './resilience/provider-failure-log.ts';

/** The run a model call belongs to. */
export type RunScope = {
    readonly scenario: ScenarioContext;
    readonly budget: RunBudgetScope;
    /** Where the provider failures of this attempt of the run are recorded. */
    readonly providerFailures: ProviderFailureLog;
};

/**
 * One harness, and so one model instance, serves every run of a configuration, but each model call still needs its
 * run: the dry-run model draws the run's scripted turns from its seed, the budget guard holds each run to its own
 * call limit, and the failure observer records into the run's current attempt. Model call options do not carry the
 * run, so the runner opens a scope around each attempt of a run and the model reads it here.
 */
const runScopeStorage = new AsyncLocalStorage<RunScope>();

export const withinRunScope = <T>(scope: RunScope, run: () => Promise<T>): Promise<T> =>
    runScopeStorage.run(scope, run);

export const currentRunScope = (): RunScope | null => runScopeStorage.getStore() ?? null;
