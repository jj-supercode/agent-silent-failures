import type { PermanentFailure, ProviderFailure, TransientFailure } from './model.ts';

/**
 * The provider failures of one attempt, in the order they happened. Kept beside the run because the agent framework
 * does not always surface them: a sub-agent's failed model call becomes an error tool result, and the supervisor run
 * still finishes.
 */
export type ProviderFailureLog = {
    readonly record: (failure: ProviderFailure) => void;
    readonly failures: () => readonly ProviderFailure[];
};

export const createProviderFailureLog = (): ProviderFailureLog => {
    let failures: readonly ProviderFailure[] = [];
    return {
        record: (failure) => {
            failures = [...failures, failure];
        },
        failures: () => failures,
    };
};

export const firstTransient = (failures: readonly ProviderFailure[]): TransientFailure | null =>
    failures.find((failure) => failure.kind === 'transient') ?? null;

export const firstPermanent = (failures: readonly ProviderFailure[]): PermanentFailure | null =>
    failures.find((failure) => failure.kind === 'permanent') ?? null;
