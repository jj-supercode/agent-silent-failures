import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';

import { billedTokenCountSchema, type BilledTokenCount } from './model.ts';

/**
 * English text averages about four characters per Claude token and JSON about three, so three per token estimates
 * high for this traffic. The estimate only decides whether a call may be sent; the ledger then checks the provider's
 * billed usage against the call limits and ends the session if a call ever broke them.
 */
const charactersPerTokenLowerBound = 3;

/** Tool use adds a system prompt of a few hundred tokens on the provider side, invisible in the call options. */
const toolUseSystemPromptAllowance = 500;

export const estimateTokensOfText = (text: string): BilledTokenCount =>
    billedTokenCountSchema.parse(Math.ceil(text.length / charactersPerTokenLowerBound));

export const estimatePromptTokens = (options: LanguageModelV4CallOptions): BilledTokenCount =>
    billedTokenCountSchema.parse(
        estimateTokensOfText(JSON.stringify({ prompt: options.prompt, tools: options.tools ?? [] })) +
            toolUseSystemPromptAllowance,
    );
