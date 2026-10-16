import { formatUsd } from './cost.ts';
import type { BilledTokenCount, BilledUsage, BudgetKey, CallLimits, Usd } from './model.ts';

/** Thrown before a model call that could take total spend past the cap; the call is never sent. */
export class BudgetExceededError extends Error {
    override readonly name = 'BudgetExceededError';
    readonly spent: Usd;
    readonly cap: Usd;

    constructor(spent: Usd, nextCallWorstCase: Usd, cap: Usd) {
        super(
            `budget cap ${formatUsd(cap)} reached: spent ${formatUsd(spent)}, the next call could cost up to ${formatUsd(nextCallWorstCase)}`,
        );
        this.spent = spent;
        this.cap = cap;
    }
}

/** Thrown before a call whose prompt is larger than the guard's limit, which keeps the worst case a real bound. */
export class PromptTooLargeError extends Error {
    override readonly name = 'PromptTooLargeError';

    constructor(estimatedTokens: BilledTokenCount, limit: BilledTokenCount) {
        super(`prompt of about ${estimatedTokens} tokens exceeds the per-call limit of ${limit}`);
    }
}

/** Thrown before a call that would exceed the per-run call limit: a runaway loop must not drain the budget. */
export class RunCallLimitError extends Error {
    override readonly name = 'RunCallLimitError';

    constructor(runKey: BudgetKey, limit: number) {
        super(`run ${runKey} reached its limit of ${limit} model calls`);
    }
}

/** Thrown before a call that could take one run past its own spend cap; only that run fails. */
export class RunBudgetExceededError extends Error {
    override readonly name = 'RunBudgetExceededError';

    constructor(runKey: BudgetKey, committed: Usd, cap: Usd) {
        super(`run ${runKey} reached its cap of ${formatUsd(cap)} (committed ${formatUsd(committed)})`);
    }
}

/**
 * Recorded when a call billed more tokens than the per-call limits allow, which means the pre-call prompt estimate
 * was wrong for this traffic. The session ends: the worst-case bound no longer holds, so no further call is sent.
 */
export class CallLimitBreachedError extends Error {
    override readonly name = 'CallLimitBreachedError';

    constructor(usage: BilledUsage, limits: CallLimits) {
        super(
            `a call billed ${usage.inputTokens} in / ${usage.outputTokens} out tokens, beyond the per-call limits of ` +
                `${limits.maxPromptTokens} / ${limits.maxOutputTokens}`,
        );
    }
}

/** Thrown when a guarded model is called outside a run scope, where no per-run limit could apply. */
export class CallOutsideRunError extends Error {
    override readonly name = 'CallOutsideRunError';

    constructor() {
        super('a guarded model was called outside a run scope');
    }
}

export type GuardRefusal =
    | BudgetExceededError
    | CallLimitBreachedError
    | PromptTooLargeError
    | RunBudgetExceededError
    | RunCallLimitError
    | CallOutsideRunError;
