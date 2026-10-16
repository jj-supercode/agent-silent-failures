import { emptySpend, type SpendState } from './model.ts';
import { emptyLedger, type LedgerPolicy, type LedgerState } from './spend-ledger.ts';

/** The one mutable cell of a live session: every guarded model of the session charges the same ledger. */
export type SpendLedger = {
    readonly read: () => LedgerState;
    readonly update: (transition: (state: LedgerState) => LedgerState) => void;
    readonly policy: LedgerPolicy;
};

/** `priorSpend` is what earlier sessions of the same recording spent: the cap covers it too. */
export const createSpendLedger = (policy: LedgerPolicy, priorSpend: SpendState = emptySpend): SpendLedger => {
    let state: LedgerState = { ...emptyLedger, spend: priorSpend };
    return {
        read: () => state,
        update: (transition) => {
            state = transition(state);
        },
        policy,
    };
};
