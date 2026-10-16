import { modelIdSchema } from '../../trace/index.ts';
import { billedTokenCountSchema, type ModelPrice } from './model.ts';

/**
 * Anthropic list prices, read from https://platform.claude.com/docs/en/about-claude/pricing on 2026-10-14.
 * Claude Haiku 5.5 bills USD 0.10 / 0.50 per million input / output tokens for prompts up to 100,000 tokens
 * (USD 0.50 / 2.50 beyond); Claude Sonnet 5.5 bills USD 2 / 10. Re-check before a live run: prices change.
 */
export const pricesReadOn = '2026-10-14';
export const pricingSourceUrl = 'https://platform.claude.com/docs/en/about-claude/pricing';

export const agentModelPrice: ModelPrice = {
    modelId: modelIdSchema.parse('claude-haiku-5-5'),
    inputUsdPerMillionTokens: 0.1,
    outputUsdPerMillionTokens: 0.5,
    priceTierPromptLimit: billedTokenCountSchema.parse(100_000),
};

export const judgeModelPrice: ModelPrice = {
    modelId: modelIdSchema.parse('claude-sonnet-5-5'),
    inputUsdPerMillionTokens: 2,
    outputUsdPerMillionTokens: 10,
    priceTierPromptLimit: billedTokenCountSchema.parse(1_000_000),
};
