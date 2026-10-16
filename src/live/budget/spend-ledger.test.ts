import { describe, expect, test } from 'vitest';

import { modelIdSchema } from '../../trace/index.ts';
import {
    BudgetExceededError,
    CallOutsideRunError,
    PromptTooLargeError,
    RunBudgetExceededError,
    RunCallLimitError,
    CallLimitBreachedError,
} from './errors.ts';
import { billedTokenCountSchema, budgetKeySchema, usdSchema } from './model.ts';
import {
    emptyLedger,
    reserveCall,
    runCommitted,
    runRefusal,
    settleCall,
    type CallRequest,
    type LedgerState,
    type RunBudgetScope,
} from './spend-ledger.ts';

const tokens = (count: number) => billedTokenCountSchema.parse(count);
const key = (runKey: string) => budgetKeySchema.parse(runKey);
const usd = (amount: number) => usdSchema.parse(amount);
const policy = { cap: usd(1) };
const limits = { maxPromptTokens: tokens(1_000), maxOutputTokens: tokens(100) };
const runScope = (runKey: string, overrides: Partial<RunBudgetScope> = {}): RunBudgetScope => ({
    runKey: key(runKey),
    maxModelCalls: 5,
    maxUsd: usd(1),
    ...overrides,
});

const request = (overrides: Partial<CallRequest> = {}): CallRequest => ({
    run: runScope('run-1'),
    promptTokens: tokens(100),
    maxPromptTokens: tokens(1_000),
    worstCase: usd(0.4),
    ...overrides,
});

const reserved = (state: LedgerState, call: CallRequest): LedgerState => {
    const result = reserveCall(state, call, policy);
    if (result.kind !== 'reserved') {
        throw result.refusal;
    }
    return result.state;
};

const refusalOf = (state: LedgerState, call: CallRequest): unknown => {
    const result = reserveCall(state, call, policy);
    return result.kind === 'refused' ? result.refusal : null;
};

const charge = (cost: number) => ({
    modelId: modelIdSchema.parse('test-model'),
    usage: { inputTokens: tokens(10), outputTokens: tokens(5) },
    cost: usd(cost),
});

describe('reserveCall', () => {
    test('reserves the worst case in the session and in the run', () => {
        const state = reserved(emptyLedger, request());
        expect(state.reserved).toBeCloseTo(0.4);
        expect(runCommitted(state, key('run-1'))).toBeCloseTo(0.4);
    });

    test('counts reserved but unsettled calls against the session cap', () => {
        const twoInFlight = reserved(
            reserved(emptyLedger, request({ run: runScope('a') })),
            request({ run: runScope('b') }),
        );
        expect(refusalOf(twoInFlight, request({ run: runScope('c') }))).toBeInstanceOf(BudgetExceededError);
    });

    test('a session cap refusal ends the session: later affordable calls are refused too', () => {
        const overCap = reserveCall(
            emptyLedger,
            request({ worstCase: usd(2), run: runScope('a', { maxUsd: usd(5) }) }),
            policy,
        );
        expect(overCap.state.refusal).toBeInstanceOf(BudgetExceededError);
        expect(refusalOf(overCap.state, request())).toBeInstanceOf(BudgetExceededError);
    });

    test('refuses a prompt over the per-call limit and fails only that run', () => {
        const tooLarge = reserveCall(emptyLedger, request({ promptTokens: tokens(5_000) }), policy);
        expect(tooLarge.kind === 'refused' && tooLarge.refusal).toBeInstanceOf(PromptTooLargeError);
        expect(tooLarge.state.refusal).toBeNull();
        expect(reserveCall(tooLarge.state, request(), policy).kind).toBe('reserved');
    });

    test('a run over its call limit is refused while other runs continue', () => {
        const limited = request({ worstCase: usd(0.01), run: runScope('run-1', { maxModelCalls: 2 }) });
        const twoCalls = reserved(reserved(emptyLedger, limited), limited);
        expect(refusalOf(twoCalls, limited)).toBeInstanceOf(RunCallLimitError);
        expect(reserveCall(twoCalls, request({ worstCase: usd(0.01), run: runScope('run-2') }), policy).kind).toBe(
            'reserved',
        );
    });

    test('a run over its own spend cap is refused while other runs continue', () => {
        const capped = request({ worstCase: usd(0.3), run: runScope('run-1', { maxUsd: usd(0.5) }) });
        const oneCall = reserved(emptyLedger, capped);
        expect(refusalOf(oneCall, capped)).toBeInstanceOf(RunBudgetExceededError);
        expect(reserveCall(oneCall, request({ worstCase: usd(0.3), run: runScope('run-2') }), policy).kind).toBe(
            'reserved',
        );
    });

    test('remembers the first refusal of each run, so a run the framework finished anyway still reads as failed', () => {
        const limited = request({ worstCase: usd(0.01), run: runScope('run-1', { maxModelCalls: 1 }) });
        const after = reserveCall(reserved(emptyLedger, limited), limited, policy).state;
        expect(runRefusal(after, key('run-1'))).toBeInstanceOf(RunCallLimitError);
        expect(runRefusal(after, key('run-2'))).toBeNull();
    });

    test('refuses a call made outside any run', () => {
        expect(refusalOf(emptyLedger, request({ run: null }))).toBeInstanceOf(CallOutsideRunError);
    });
});

describe('settleCall', () => {
    test('replaces the reserved worst case with the billed cost, in the session and the run', () => {
        const state = settleCall(reserved(emptyLedger, request()), {
            runKey: key('run-1'),
            reservedWorstCase: usd(0.4),
            limits,
            charge: charge(0.05),
        });
        expect(state.reserved).toBe(0);
        expect(state.spend.spent).toBeCloseTo(0.05);
        expect(state.spend.callCount).toBe(1);
        expect(state.spend.inputTokens).toBe(10);
        expect(runCommitted(state, key('run-1'))).toBeCloseTo(0.05);
    });

    test('a settled run has room for calls its reservations had blocked', () => {
        const capped = request({ worstCase: usd(0.3), run: runScope('run-1', { maxUsd: usd(0.5) }) });
        const settled = settleCall(reserved(emptyLedger, capped), {
            runKey: key('run-1'),
            reservedWorstCase: usd(0.3),
            limits,
            charge: charge(0.01),
        });
        expect(reserveCall(settled, capped, policy).kind).toBe('reserved');
    });

    test('a call that billed past its limits ends the session, since the prompt estimate no longer bounds it', () => {
        const overBilled = {
            ...charge(0.01),
            usage: { inputTokens: tokens(limits.maxPromptTokens + 1), outputTokens: tokens(5) },
        };
        const state = settleCall(reserved(emptyLedger, request()), {
            runKey: key('run-1'),
            reservedWorstCase: usd(0.4),
            limits,
            charge: overBilled,
        });
        expect(state.refusal).toBeInstanceOf(CallLimitBreachedError);
        expect(refusalOf(state, request({ run: runScope('run-2') }))).toBeInstanceOf(CallLimitBreachedError);
    });
});
