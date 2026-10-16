import {
    billedTokenCountSchema,
    usdSchema,
    type BilledUsage,
    type CallLimits,
    type Charge,
    type ModelPrice,
    type SpendState,
    type Usd,
} from './model.ts';

const tokensPerMillion = 1_000_000;

export const costOf = (usage: BilledUsage, price: ModelPrice): Usd =>
    usdSchema.parse(
        (usage.inputTokens * price.inputUsdPerMillionTokens + usage.outputTokens * price.outputUsdPerMillionTokens) /
            tokensPerMillion,
    );

/** The most one call can cost when the guard holds it to its limits. */
export const worstCaseCallCost = (price: ModelPrice, limits: CallLimits): Usd =>
    costOf({ inputTokens: limits.maxPromptTokens, outputTokens: limits.maxOutputTokens }, price);

export const sumUsd = (amounts: readonly Usd[]): Usd =>
    usdSchema.parse(amounts.reduce((total, amount) => total + amount, 0));

export const addCharge = (state: SpendState, charge: Charge): SpendState => ({
    spent: sumUsd([state.spent, charge.cost]),
    callCount: state.callCount + 1,
    inputTokens: billedTokenCountSchema.parse(state.inputTokens + charge.usage.inputTokens),
    outputTokens: billedTokenCountSchema.parse(state.outputTokens + charge.usage.outputTokens),
});

export const wouldExceedCap = (committed: Usd, nextCallWorstCase: Usd, cap: Usd): boolean =>
    committed + nextCallWorstCase > cap;

export const formatUsd = (amount: Usd): string => `USD ${amount.toFixed(4)}`;
