import { describe, expect, test } from 'vitest';

import { costOf, sumUsd, worstCaseCallCost, wouldExceedCap } from './cost.ts';
import { billedTokenCountSchema, usdSchema } from './model.ts';
import { agentCallLimits, judgeCallLimits } from '../run-limits.ts';
import { agentModelPrice, judgeModelPrice } from './pricing.ts';

const tokens = (count: number) => billedTokenCountSchema.parse(count);
const usd = (amount: number) => usdSchema.parse(amount);
const oneMillion = 1_000_000;

describe('costOf', () => {
    test('bills a million input tokens of the agent model at its listed input price', () => {
        expect(costOf({ inputTokens: tokens(oneMillion), outputTokens: tokens(0) }, agentModelPrice)).toBeCloseTo(0.1);
    });

    test('bills output tokens at the output price', () => {
        expect(costOf({ inputTokens: tokens(0), outputTokens: tokens(oneMillion) }, judgeModelPrice)).toBeCloseTo(10);
    });

    test('is zero for zero usage', () => {
        expect(costOf({ inputTokens: tokens(0), outputTokens: tokens(0) }, agentModelPrice)).toBe(0);
    });
});

describe('worstCaseCallCost', () => {
    test('prices a call at its prompt and output limits', () => {
        const limits = { maxPromptTokens: tokens(12_000), maxOutputTokens: tokens(2_000) };
        expect(worstCaseCallCost(agentModelPrice, limits)).toBeCloseTo((12_000 * 0.1 + 2_000 * 0.5) / oneMillion);
    });
});

describe('wouldExceedCap', () => {
    test('allows a call that lands exactly on the cap', () => {
        expect(wouldExceedCap(usd(9), usd(1), usd(10))).toBe(false);
    });

    test('refuses a call whose worst case crosses the cap', () => {
        expect(wouldExceedCap(usd(9.5), usd(0.6), usd(10))).toBe(true);
    });
});

describe('sumUsd', () => {
    test('adds amounts and is zero for none', () => {
        expect(sumUsd([usd(1), usd(2.5)])).toBe(3.5);
        expect(sumUsd([])).toBe(0);
    });
});

describe('pricing', () => {
    test('every prompt the guard allows stays on the price tier the constants describe', () => {
        expect(agentCallLimits.maxPromptTokens).toBeLessThanOrEqual(agentModelPrice.priceTierPromptLimit);
        expect(judgeCallLimits.maxPromptTokens).toBeLessThanOrEqual(judgeModelPrice.priceTierPromptLimit);
    });
});
