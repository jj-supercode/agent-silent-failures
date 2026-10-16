import {
    groupsByHarness,
    openHarnessSession,
    type HarnessPlan,
    type HarnessSession,
    type RunSpec,
} from '../bed/index.ts';
import { withModel } from '../harness/index.ts';
import { appendRecordedRun, toRecordedLabels, type EnvironmentValues, type RecordedRunInput } from '../record/index.ts';
import type { SpendLedger } from './budget/session-ledger.ts';
import { judgeModelPrice } from './budget/pricing.ts';
import { attemptAwareAgentModel } from './agent-model-layers.ts';
import { errorText } from './error-text.ts';
import { createAnswerJudge, type AnswerJudge } from './judge/answer-judge.ts';
import { recordAttempt } from './record-attempt.ts';
import { firstAttempt, type AttemptNumber, type Milliseconds, type RetriedRun } from './resilience/model.ts';
import type { SessionResilience } from './resilience/session-resilience.ts';
import { withRetries } from './resilience/with-retries.ts';
import { judgeCallLimits } from './run-limits.ts';
import { guarded, type SessionModels } from './session-models.ts';

export type RecordingSession = {
    readonly fixtureDirectory: string;
    readonly models: SessionModels;
    readonly ledger: SpendLedger;
    readonly environment: EnvironmentValues;
    readonly resilience: SessionResilience;
    /** Awaited after each run's line is written, before the next run starts. */
    readonly onRun: (progress: RunProgress) => Promise<void>;
};

export type RunProgress = {
    /** Runs recorded so far in this session, this one included. */
    readonly recordedRuns: number;
    readonly total: number;
    readonly spec: RunSpec;
    /** Why the run failed; `null` when it completed. */
    readonly failure: string | null;
    /** Set when the run took more than one attempt or met a transient failure. */
    readonly retried: RetriedRun | null;
    /** The session's network pauses so far. */
    readonly networkPaused: Milliseconds;
};

export type SessionOutcome = {
    readonly recordedRuns: number;
    readonly failedRuns: number;
    readonly retriedRuns: readonly RetriedRun[];
    readonly networkPaused: Milliseconds;
    /** Why the session ended before its last planned run, or `null`. */
    readonly stoppedEarly: string | null;
};

type RecordedOutcome = RecordedRunInput['outcome'];

/** One run's written outcome and its attempts. */
type RunRecord = { readonly outcome: RecordedOutcome; readonly retried: RetriedRun | null };

/** The attempts of a run before its line is written. */
type RunAttempts = {
    readonly outcome: RecordedOutcome;
    readonly attempts: AttemptNumber;
    readonly transientFailures: readonly string[];
};

const failed = (reason: string): RecordedOutcome => ({ kind: 'failed', reason });

/** The plan with its scripted model swapped for the session's agent model, layered for recording. */
const withRecordedAgentModel = (plan: HarnessPlan, session: RecordingSession): HarnessPlan => ({
    ...plan,
    config: withModel(plan.config, {
        kind: 'provided',
        model: attemptAwareAgentModel(session.models.agentModelFor(plan.config), session.ledger),
    }),
});

/** Why the session must stop before its next attempt: a session-wide budget refusal or an outage past its limit. */
const sessionStop = (session: RecordingSession): string | null => {
    const refusal = session.ledger.read().refusal ?? session.resilience.watch.read().outage;
    return refusal === null ? null : errorText(refusal);
};

const retriedRunOf = (spec: RunSpec, attempts: RunAttempts, written: RecordedOutcome): RetriedRun | null =>
    attempts.attempts > 1 || attempts.transientFailures.length > 0
        ? {
              runId: spec.runId,
              attempts: attempts.attempts,
              transientFailures: attempts.transientFailures,
              outcome: written.kind,
          }
        : null;

/** Attempts one run under the retry policy; `null` when an outage closed the session before its first attempt. */
const attemptRun = async (
    harness: HarnessSession,
    spec: RunSpec,
    judge: AnswerJudge | null,
    session: RecordingSession,
): Promise<RunAttempts | null> => {
    const retried = await withRetries(
        (attempt) => recordAttempt({ harness, spec, judge, ledger: session.ledger }, attempt),
        { runId: spec.runId, resilience: session.resilience, sessionStopped: () => sessionStop(session) !== null },
    );
    switch (retried.kind) {
        case 'succeeded':
            return { outcome: retried.value, attempts: retried.attempts, transientFailures: retried.transientFailures };
        case 'failed':
            return {
                outcome: failed(retried.reason),
                attempts: retried.attempts,
                transientFailures: retried.transientFailures,
            };
        case 'not-attempted':
            return null;
        default:
            return retried satisfies never;
    }
};

type GroupContext = {
    readonly group: readonly [RunSpec, ...RunSpec[]];
    readonly plan: HarnessPlan;
    readonly session: RecordingSession;
    readonly progress: { readonly offset: number; readonly total: number };
};

/** Writes one outcome, whatever it is: a run counted in the manifest always has its line in the fixture. */
const appendRun = async (
    { plan, session, progress }: GroupContext,
    spec: RunSpec,
    index: number,
    attempts: RunAttempts,
): Promise<RunRecord> => {
    const appended = await appendRecordedRun(
        session.fixtureDirectory,
        { labels: toRecordedLabels(spec, plan.key), outcome: attempts.outcome },
        session.environment,
    );
    const outcome = appended.kind === 'written' ? attempts.outcome : failed('withheld from the fixture');
    const retried = retriedRunOf(spec, attempts, outcome);
    await session.onRun({
        recordedRuns: progress.offset + index + 1,
        total: progress.total,
        spec,
        failure: outcome.kind === 'completed' ? null : outcome.reason,
        retried,
        networkPaused: session.resilience.watch.read().totalPaused,
    });
    return { outcome, retried };
};

/** A harness that failed to open fails every run of its group at once: one attempt, nothing sent. */
const notOpened = (reason: string): RunAttempts => ({
    outcome: failed(reason),
    attempts: firstAttempt,
    transientFailures: [],
});

const groupRecords = async (context: GroupContext): Promise<readonly (RunRecord | null)[]> => {
    const { group, plan, session } = context;
    const opening = await openHarnessSession(plan);
    if (opening.kind === 'failed') {
        return Array.fromAsync(group.entries(), ([index, spec]) =>
            appendRun(context, spec, index, notOpened(`harness ${plan.key}: ${opening.reason}`)),
        );
    }
    const judge =
        session.models.judgeModel === null
            ? null
            : createAnswerJudge(guarded(session.models.judgeModel, session.ledger, judgeModelPrice, judgeCallLimits));
    await using harness = opening.session;
    return await Array.fromAsync(group.entries(), async ([index, spec]) => {
        if (sessionStop(session) !== null) {
            return null;
        }
        const attempts = await attemptRun(harness, spec, judge, session);
        return attempts === null ? null : appendRun(context, spec, index, attempts);
    });
};

const recordGroup = async (
    group: readonly [RunSpec, ...RunSpec[]],
    session: RecordingSession,
    progress: GroupContext['progress'],
): Promise<readonly RunRecord[]> => {
    const records = await groupRecords({
        group,
        plan: withRecordedAgentModel(group[0].plan, session),
        session,
        progress,
    });
    return records.flatMap((record) => (record === null ? [] : [record]));
};

/**
 * Records every run of the plan, one harness at a time, appending each run to the fixture as it finishes. A run that
 * fails transiently is retried under the session's policy; the session pauses while the network is down. It stops
 * before the next run once the budget guard has refused a call for the whole session or an outage outlasts its
 * limit; what was recorded stays.
 */
export const recordSession = async (specs: readonly RunSpec[], session: RecordingSession): Promise<SessionOutcome> => {
    const groups = groupsByHarness(specs);
    const offsets = groups.map((_, index) => groups.slice(0, index).reduce((total, group) => total + group.length, 0));
    const recordsByGroup = await Array.fromAsync(groups.entries(), ([index, group]) =>
        sessionStop(session) === null
            ? recordGroup(group, session, { offset: offsets[index] ?? 0, total: specs.length })
            : [],
    );
    const records = recordsByGroup.flat();
    return {
        recordedRuns: records.length,
        failedRuns: records.filter((record) => record.outcome.kind === 'failed').length,
        retriedRuns: records.flatMap((record) => (record.retried === null ? [] : [record.retried])),
        networkPaused: session.resilience.watch.read().totalPaused,
        stoppedEarly: records.length < specs.length ? sessionStop(session) : null,
    };
};
