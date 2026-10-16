import type { LanguageModelV4 } from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';

import { budgetGuardMiddleware } from '../budget/budget-guard.ts';
import { budgetKeySchema, type Usd } from '../budget/model.ts';
import { agentModelPrice } from '../budget/pricing.ts';
import { createSpendLedger, type SpendLedger } from '../budget/session-ledger.ts';
import type { RunBudgetScope } from '../budget/spend-ledger.ts';
import { agentCallLimits } from '../run-limits.ts';
import { studioSpendOf, type StudioSpend, type StudioSpendTerms } from './studio-spend.ts';

/**
 * Studio calls run outside any recorded run, so the whole server session is one budget scope: the session cap is
 * its spend limit and the only bound on the number of calls.
 */
const studioSessionScope = (cap: Usd): RunBudgetScope => ({
    runKey: budgetKeySchema.parse('studio-session'),
    maxModelCalls: Number.POSITIVE_INFINITY,
    maxUsd: cap,
});

/** Studio bills at the agent's price, and every call is held to the agent's per-call limits, as in `pnpm demo:live`. */
export const studioSpendTerms = (cap: Usd): StudioSpendTerms => ({
    cap,
    price: agentModelPrice,
    limits: agentCallLimits,
});

export type StudioBudget = {
    readonly cap: Usd;
    /** Called after every settled model call, the failed ones (charged at their worst case) included. */
    readonly onSpend: (spend: StudioSpend) => void;
};

/** A ledger that reports the session's spend whenever a call settles. */
const reportingSettledCalls = (ledger: SpendLedger, report: (ledger: SpendLedger) => void): SpendLedger => ({
    ...ledger,
    update: (transition) => {
        const callsBefore = ledger.read().spend.callCount;
        ledger.update(transition);
        if (ledger.read().spend.callCount !== callsBefore) {
            report(ledger);
        }
    },
});

/**
 * Puts the Studio agent's model behind the same budget guard `pnpm demo:live` uses, at the agent's price and per-call
 * limits: a call whose worst case could cross the cap is refused before it is sent.
 */
export const guardStudioModel = (model: LanguageModelV4, { cap, onSpend }: StudioBudget): LanguageModelV4 => {
    const terms = studioSpendTerms(cap);
    const ledger = reportingSettledCalls(createSpendLedger({ cap }), (settled) =>
        onSpend(studioSpendOf(settled.read(), terms)),
    );
    const scope = studioSessionScope(cap);
    return wrapLanguageModel({
        model,
        middleware: budgetGuardMiddleware({
            ledger,
            price: terms.price,
            limits: terms.limits,
            currentRun: () => scope,
        }),
    });
};
