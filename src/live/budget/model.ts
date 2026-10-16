import { z } from 'zod';

import type { ModelId } from '../../trace/index.ts';

/** US dollars. Never mixed with token counts, which are a different unit at a different scale. */
export const usdSchema = z.number().nonnegative().brand<'Usd'>();
export type Usd = z.infer<typeof usdSchema>;

/**
 * Tokens as the provider bills them. Kept apart from the trace module's `TokenCount`, which counts the embedder's
 * tokenizer: the two tokenizers disagree, so the counts are not interchangeable.
 */
export const billedTokenCountSchema = z.int().nonnegative().brand<'BilledTokenCount'>();
export type BilledTokenCount = z.infer<typeof billedTokenCountSchema>;

/**
 * Which budget a model call is charged to: an agent run's id, or `<run id>/judge` for its judge call, which has its
 * own limits. Kept apart from the bed's `RunId` because one run owns two budgets.
 */
export const budgetKeySchema = z.string().min(1).brand<'BudgetKey'>();
export type BudgetKey = z.infer<typeof budgetKeySchema>;

export type ModelPrice = {
    readonly modelId: ModelId;
    readonly inputUsdPerMillionTokens: number;
    readonly outputUsdPerMillionTokens: number;
    /** The price holds for prompts up to this size; larger prompts bill at a higher tier the guard never allows. */
    readonly priceTierPromptLimit: BilledTokenCount;
};

export type BilledUsage = {
    readonly inputTokens: BilledTokenCount;
    readonly outputTokens: BilledTokenCount;
};

/** Hard limits per model call; the guard refuses a call that could break them, so the worst case is a real bound. */
export type CallLimits = {
    readonly maxPromptTokens: BilledTokenCount;
    readonly maxOutputTokens: BilledTokenCount;
};

/** One billed (or, in a dry run, estimated) model call. */
export type Charge = {
    readonly modelId: ModelId;
    readonly usage: BilledUsage;
    readonly cost: Usd;
};

export type SpendState = {
    readonly spent: Usd;
    readonly callCount: number;
    readonly inputTokens: BilledTokenCount;
    readonly outputTokens: BilledTokenCount;
};

export const emptySpend: SpendState = {
    spent: usdSchema.parse(0),
    callCount: 0,
    inputTokens: billedTokenCountSchema.parse(0),
    outputTokens: billedTokenCountSchema.parse(0),
};
