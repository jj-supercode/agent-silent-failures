import type { HarnessSession, RunId, RunSpec } from '../bed/index.ts';
import { sanitizeTrace, type RecordedRunInput } from '../record/index.ts';
import { loadTraceSpans } from '../trace/index.ts';
import { budgetKeySchema, type BudgetKey } from './budget/model.ts';
import type { SpendLedger } from './budget/session-ledger.ts';
import { runRefusal } from './budget/spend-ledger.ts';
import { errorText } from './error-text.ts';
import { judgeAnswer, type AnswerJudge, type AnswerJudgement } from './judge/answer-judge.ts';
import { firstAttempt, type AttemptNumber, type ProviderFailure } from './resilience/model.ts';
import { classifyProviderFailure } from './resilience/provider-failure.ts';
import {
    createProviderFailureLog,
    firstPermanent,
    firstTransient,
    type ProviderFailureLog,
} from './resilience/provider-failure-log.ts';
import type { AttemptOutcome } from './resilience/with-retries.ts';
import { judgeRunLimits, runLimits } from './run-limits.ts';
import { withinRunScope, type RunScope } from './run-scope.ts';

export type CompletedOutcome = Extract<RecordedRunInput['outcome'], { readonly kind: 'completed' }>;

export type AttemptContext = {
    readonly harness: HarnessSession;
    readonly spec: RunSpec;
    readonly judge: AnswerJudge | null;
    readonly ledger: SpendLedger;
};

/**
 * The budget an attempt charges. The first attempt keeps the run id, so a session without retries charges exactly
 * what it always did; each retry gets its own key and its own run limits, so the calls of a failed attempt never eat
 * into the next one, while the session cap still counts every attempt.
 */
export const attemptBudgetKey = (runId: RunId, attempt: AttemptNumber): BudgetKey =>
    budgetKeySchema.parse(attempt === firstAttempt ? runId : `${runId}/attempt-${attempt}`);

const agentScope = (spec: RunSpec, attempt: AttemptNumber, providerFailures: ProviderFailureLog): RunScope => ({
    scenario: { questionId: spec.question.id, seed: spec.seed },
    budget: { runKey: attemptBudgetKey(spec.runId, attempt), ...runLimits[spec.harness] },
    providerFailures,
});

const judgeScope = (spec: RunSpec): RunScope => ({
    scenario: { questionId: spec.question.id, seed: spec.seed },
    budget: { runKey: budgetKeySchema.parse(`${spec.runId}/judge`), ...judgeRunLimits },
    providerFailures: createProviderFailureLog(),
});

const failedWith = (failure: ProviderFailure): AttemptOutcome<CompletedOutcome> => ({ kind: 'failed', failure });

const permanentlyFailed = (reason: string): AttemptOutcome<CompletedOutcome> =>
    failedWith({ kind: 'permanent', reason });

const judgedOutcome = async (
    judge: AnswerJudge | null,
    spec: RunSpec,
    answer: string,
): Promise<AnswerJudgement | null> =>
    judge === null
        ? null
        : withinRunScope(judgeScope(spec), () =>
              judgeAnswer(judge, { question: spec.question.question, goldAnswer: spec.question.answer, answer }),
          );

/**
 * One attempt of one run, in its own run scope. A transient provider failure anywhere in the attempt makes the whole
 * attempt transient, even when the run finished: a sub-agent's failed call becomes an error tool result, so the
 * supervisor's trace would record a network fault as agent behaviour. Everything else that goes wrong (a guard
 * refusal, a request error, an unreadable trace) fails the attempt permanently.
 */
export const recordAttempt = async (
    { harness, spec, judge, ledger }: AttemptContext,
    attempt: AttemptNumber,
): Promise<AttemptOutcome<CompletedOutcome>> => {
    const providerFailures = createProviderFailureLog();
    const scope = agentScope(spec, attempt, providerFailures);
    const ran = await withinRunScope(scope, () => harness.runAgent(spec)).catch(
        (error: unknown) => ({ kind: 'thrown', error }) as const,
    );
    const transient = firstTransient(providerFailures.failures());
    if (transient !== null) {
        return failedWith(transient);
    }
    const refusal = runRefusal(ledger.read(), scope.budget.runKey);
    if (refusal !== null) {
        return permanentlyFailed(errorText(refusal));
    }
    if (ran.kind === 'thrown') {
        return failedWith(classifyProviderFailure(ran.error));
    }
    if (ran.kind === 'failed') {
        return permanentlyFailed(ran.reason);
    }
    const swallowed = firstPermanent(providerFailures.failures());
    if (swallowed !== null) {
        return permanentlyFailed(`a model call of the run failed: ${swallowed.reason}`);
    }
    const loaded = await loadTraceSpans(harness.mastra, ran.run.traceId);
    if (loaded.kind === 'failed') {
        return permanentlyFailed(`trace ${ran.run.traceId}: ${JSON.stringify(loaded.failure)}`);
    }
    return {
        kind: 'succeeded',
        value: {
            kind: 'completed',
            trace: { traceId: ran.run.traceId, spans: sanitizeTrace(loaded.spans) },
            judgement: await judgedOutcome(judge, spec, ran.run.answerText),
        },
    };
};
