import { formatUsd, sumUsd, worstCaseCallCost } from '../budget/cost.ts';
import { usdSchema, type CallLimits, type ModelPrice, type SpendState, type Usd } from '../budget/model.ts';
import type { LedgerState } from '../budget/spend-ledger.ts';

/** What a Studio live session has spent after a settled model call, and whether the cap still allows another. */
export type StudioSpend = {
    readonly spend: SpendState;
    readonly cap: Usd;
    readonly nextCallWorstCase: Usd;
    readonly capReached: boolean;
};

export type StudioSpendTerms = {
    readonly cap: Usd;
    readonly price: ModelPrice;
    readonly limits: CallLimits;
};

export const studioSpendOf = (state: LedgerState, terms: StudioSpendTerms): StudioSpend => {
    const nextCallWorstCase = worstCaseCallCost(terms.price, terms.limits);
    const committed = sumUsd([state.spend.spent, state.reserved]);
    return {
        spend: state.spend,
        cap: terms.cap,
        nextCallWorstCase,
        capReached: committed + nextCallWorstCase > terms.cap,
    };
};

/** Clamped at zero: a call that bills past its per-call limits can overshoot the cap by that one call. */
const remaining = (spend: StudioSpend): Usd => usdSchema.parse(Math.max(0, spend.cap - spend.spend.spent));

export const formatStudioSpend = (spend: StudioSpend): string =>
    `[studio:live] call ${spend.spend.callCount}: spent ${formatUsd(spend.spend.spent)} of ${formatUsd(spend.cap)} ` +
    `(${spend.spend.inputTokens} in / ${spend.spend.outputTokens} out tokens, ${formatUsd(remaining(spend))} left)` +
    (spend.capReached
        ? `; cap reached: the next call could cost up to ${formatUsd(spend.nextCallWorstCase)}, so it is refused`
        : '');

/** The one line `pnpm studio:live` prints before Mastra starts: the model, the cap and the most one call can cost. */
export const formatStudioLiveTerms = (terms: StudioSpendTerms, capVariable: string): string =>
    `[studio:live] ${terms.price.modelId}, session cap ${formatUsd(terms.cap)} (set ${capVariable} to change it), ` +
    `at most ${formatUsd(worstCaseCallCost(terms.price, terms.limits))} per model call. ` +
    'Spend prints after every call; a call that could cross the cap is refused.';
