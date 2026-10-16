import { describe, expect, test } from 'vitest';

import { worstCaseCallCost } from '../budget/cost.ts';
import { billedTokenCountSchema, usdSchema } from '../budget/model.ts';
import { agentModelPrice } from '../budget/pricing.ts';
import { emptyLedger, type LedgerState } from '../budget/spend-ledger.ts';
import { agentCallLimits } from '../run-limits.ts';
import { formatStudioLiveTerms, formatStudioSpend, studioSpendOf } from './studio-spend.ts';

const cap = usdSchema.parse(1);
const terms = { cap, price: agentModelPrice, limits: agentCallLimits };
const callWorstCase = worstCaseCallCost(agentModelPrice, agentCallLimits);

const ledgerAfter = (spent: number, callCount: number): LedgerState => ({
    ...emptyLedger,
    spend: {
        spent: usdSchema.parse(spent),
        callCount,
        inputTokens: billedTokenCountSchema.parse(3_000),
        outputTokens: billedTokenCountSchema.parse(200),
    },
});

describe('studioSpendOf', () => {
    test('the cap is open while one more worst-case call still fits', () => {
        expect(studioSpendOf(ledgerAfter(cap - callWorstCase, 9), terms).capReached).toBe(false);
    });

    test('the cap is reached once one more worst-case call could cross it', () => {
        expect(studioSpendOf(ledgerAfter(cap - callWorstCase / 2, 9), terms).capReached).toBe(true);
    });

    test('in-flight reservations count against the cap', () => {
        const reserving = { ...ledgerAfter(cap - callWorstCase, 9), reserved: usdSchema.parse(callWorstCase) };
        expect(studioSpendOf(reserving, terms).capReached).toBe(true);
    });
});

describe('formatStudioSpend', () => {
    test('prints the call count, the spend against the cap, the tokens and what is left', () => {
        expect(formatStudioSpend(studioSpendOf(ledgerAfter(0.0125, 4), terms))).toBe(
            '[studio:live] call 4: spent USD 0.0125 of USD 1.0000 (3000 in / 200 out tokens, USD 0.9875 left)',
        );
    });

    test('says when the next call will be refused', () => {
        expect(formatStudioSpend(studioSpendOf(ledgerAfter(cap, 210), terms))).toBe(
            '[studio:live] call 210: spent USD 1.0000 of USD 1.0000 (3000 in / 200 out tokens, USD 0.0000 left); ' +
                'cap reached: the next call could cost up to USD 0.0047, so it is refused',
        );
    });
});

describe('formatStudioLiveTerms', () => {
    test('names the model, the cap, how to change it and the most one call can cost', () => {
        expect(formatStudioLiveTerms(terms, 'STUDIO_LIVE_MAX_USD')).toBe(
            '[studio:live] claude-haiku-5-5, session cap USD 1.0000 (set STUDIO_LIVE_MAX_USD to change it), ' +
                'at most USD 0.0047 per model call. Spend prints after every call; a call that could cross the cap ' +
                'is refused.',
        );
    });
});
