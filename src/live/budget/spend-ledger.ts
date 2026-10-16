import { addCharge, sumUsd, wouldExceedCap } from './cost.ts';
import {
    BudgetExceededError,
    CallLimitBreachedError,
    CallOutsideRunError,
    PromptTooLargeError,
    RunBudgetExceededError,
    RunCallLimitError,
    type GuardRefusal,
} from './errors.ts';
import {
    emptySpend,
    usdSchema,
    type BilledTokenCount,
    type BudgetKey,
    type CallLimits,
    type Charge,
    type SpendState,
    type Usd,
} from './model.ts';

export type LedgerPolicy = {
    /** The session cap: no call is sent whose worst case could take total spend past it. */
    readonly cap: Usd;
};

/** The run a model call belongs to, with that run's own limits. */
export type RunBudgetScope = {
    readonly runKey: BudgetKey;
    readonly maxModelCalls: number;
    /** No call of the run is sent whose worst case could take the run's own spend past this. */
    readonly maxUsd: Usd;
};

type RunLedger = {
    readonly calls: number;
    /** Billed cost of the run's settled calls plus the worst case of its in-flight calls. */
    readonly committed: Usd;
    /**
     * The first refusal of one of the run's calls. Kept on the ledger because the agent framework may surface a model
     * error as an ordinary finished run; the runner reads it here and records the run as failed regardless.
     */
    readonly refusal: GuardRefusal | null;
};

/**
 * Spend plus what in-flight calls could still cost. A call reserves its worst case before it is sent and settles to
 * its billed usage afterwards, so concurrent calls can never jointly overshoot the session or a run cap.
 */
export type LedgerState = {
    readonly spend: SpendState;
    readonly reserved: Usd;
    readonly runs: ReadonlyMap<BudgetKey, RunLedger>;
    /** The first session-wide refusal ends the session: later calls are refused too, and the runner reports this one. */
    readonly refusal: GuardRefusal | null;
};

export const emptyLedger: LedgerState = {
    spend: emptySpend,
    reserved: usdSchema.parse(0),
    runs: new Map(),
    refusal: null,
};

const emptyRun: RunLedger = { calls: 0, committed: usdSchema.parse(0), refusal: null };

const runLedgerOf = (state: LedgerState, runKey: BudgetKey): RunLedger => state.runs.get(runKey) ?? emptyRun;

const withRun = (state: LedgerState, runKey: BudgetKey, run: RunLedger): ReadonlyMap<BudgetKey, RunLedger> =>
    new Map([...state.runs, [runKey, run]]);

export type CallRequest = {
    readonly run: RunBudgetScope | null;
    readonly promptTokens: BilledTokenCount;
    readonly maxPromptTokens: BilledTokenCount;
    readonly worstCase: Usd;
};

export type ReservationResult =
    | { readonly kind: 'reserved'; readonly runKey: BudgetKey; readonly state: LedgerState }
    | { readonly kind: 'refused'; readonly refusal: GuardRefusal; readonly state: LedgerState };

const refusalFor = (
    state: LedgerState,
    run: RunBudgetScope,
    request: CallRequest,
    policy: LedgerPolicy,
): GuardRefusal | null => {
    const runLedger = runLedgerOf(state, run.runKey);
    if (request.promptTokens > request.maxPromptTokens) {
        return new PromptTooLargeError(request.promptTokens, request.maxPromptTokens);
    }
    if (runLedger.calls >= run.maxModelCalls) {
        return new RunCallLimitError(run.runKey, run.maxModelCalls);
    }
    if (wouldExceedCap(runLedger.committed, request.worstCase, run.maxUsd)) {
        return new RunBudgetExceededError(run.runKey, runLedger.committed, run.maxUsd);
    }
    const committed = sumUsd([state.spend.spent, state.reserved]);
    return wouldExceedCap(committed, request.worstCase, policy.cap)
        ? new BudgetExceededError(committed, request.worstCase, policy.cap)
        : null;
};

/** The session cap, a breached call limit or an unscoped call end the session; the rest fail the one run. */
const endsSession = (refusal: GuardRefusal): boolean =>
    refusal instanceof BudgetExceededError ||
    refusal instanceof CallLimitBreachedError ||
    refusal instanceof CallOutsideRunError;

const withRunRefusal = (state: LedgerState, run: RunBudgetScope | null, refusal: GuardRefusal): LedgerState => {
    const runLedger = run === null ? null : runLedgerOf(state, run.runKey);
    return run === null || runLedger === null || runLedger.refusal !== null
        ? state
        : { ...state, runs: withRun(state, run.runKey, { ...runLedger, refusal }) };
};

const refused = (state: LedgerState, run: RunBudgetScope | null, refusal: GuardRefusal): ReservationResult => {
    const withRefusal = withRunRefusal(state, run, refusal);
    return {
        kind: 'refused',
        refusal,
        state: endsSession(refusal) && state.refusal === null ? { ...withRefusal, refusal } : withRefusal,
    };
};

export const reserveCall = (state: LedgerState, request: CallRequest, policy: LedgerPolicy): ReservationResult => {
    const { run } = request;
    if (state.refusal !== null) {
        return refused(state, run, state.refusal);
    }
    if (run === null) {
        return refused(state, run, new CallOutsideRunError());
    }
    const refusal = refusalFor(state, run, request, policy);
    if (refusal !== null) {
        return refused(state, run, refusal);
    }
    const runLedger = runLedgerOf(state, run.runKey);
    return {
        kind: 'reserved',
        runKey: run.runKey,
        state: {
            ...state,
            reserved: sumUsd([state.reserved, request.worstCase]),
            runs: withRun(state, run.runKey, {
                ...runLedger,
                calls: runLedger.calls + 1,
                committed: sumUsd([runLedger.committed, request.worstCase]),
            }),
        },
    };
};

const released = (amount: Usd, worstCase: Usd): Usd => usdSchema.parse(Math.max(0, amount - worstCase));

const breachOf = (charge: Charge, limits: CallLimits): CallLimitBreachedError | null =>
    charge.usage.inputTokens > limits.maxPromptTokens || charge.usage.outputTokens > limits.maxOutputTokens
        ? new CallLimitBreachedError(charge.usage, limits)
        : null;

export type Settlement = {
    readonly runKey: BudgetKey;
    readonly reservedWorstCase: Usd;
    readonly limits: CallLimits;
    readonly charge: Charge;
};

/**
 * Replaces a reserved call's worst case with its billed cost, in the session and in its run. A call that billed past
 * its limits ends the session, so a wrong prompt estimate can overshoot the bound by at most that one call.
 */
export const settleCall = (
    state: LedgerState,
    { runKey, reservedWorstCase, limits, charge }: Settlement,
): LedgerState => {
    const runLedger = runLedgerOf(state, runKey);
    const breach = breachOf(charge, limits);
    return {
        ...state,
        refusal: state.refusal ?? breach,
        spend: addCharge(state.spend, charge),
        reserved: released(state.reserved, reservedWorstCase),
        runs: withRun(state, runKey, {
            ...runLedger,
            committed: sumUsd([released(runLedger.committed, reservedWorstCase), charge.cost]),
        }),
    };
};

/** What one run has committed so far: billed calls plus the worst case of any still in flight. */
export const runCommitted = (state: LedgerState, runKey: BudgetKey): Usd => runLedgerOf(state, runKey).committed;

/** The first refusal any call of the run met, or `null`. */
export const runRefusal = (state: LedgerState, runKey: BudgetKey): GuardRefusal | null =>
    runLedgerOf(state, runKey).refusal;
