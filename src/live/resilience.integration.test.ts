import { appendFile, mkdtempDisposable, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeAll, describe, expect, test } from 'vitest';

import { planRuns, runBed, type RunId, type RunSpec, type ScoredRun } from '../bed/index.ts';
import { loadQuestions, type CorpusQuestion } from '../corpus/index.ts';
import {
    fixtureFileNames,
    manifestBase,
    readFixtureSet,
    startFixtureSet,
    type FixtureSet,
    type ManifestBase,
} from '../record/index.ts';
import { replayFixtures } from '../replay/index.ts';
import { usdSchema, type BudgetKey } from './budget/model.ts';
import { decidePreflight } from './budget/preflight.ts';
import { sessionManifestSchema } from './fixture-manifest.ts';
import type { LiveOptions } from './live-options.ts';
import { selectLiveRuns } from './live-plan.ts';
import { plannedSpend } from './planned-spend.ts';
import { recordToFixtures, type RecordedSession } from './record-to-fixtures.ts';
import { attemptNumberSchema, firstAttempt, millisecondsSchema, type NetworkPausePolicy } from './resilience/model.ts';
import { attemptBudgetKey } from './record-attempt.ts';
import { networkPausePolicy } from './resilience/policy.ts';
import { keepCompletedRuns, runsBackupFileName } from './resume/keep-completed-runs.ts';
import { prepareResume } from './resume/prepare-resume.ts';
import { newRecording, type RecordingHistory } from './session-files.ts';
import { dryRunModels } from './session-models.ts';
import { currentIdentity, liveSplit } from './session-plan.ts';
import { spendContextOf } from './spend-summary.ts';
import {
    badRequestError,
    instantResilience,
    offlineError,
    overloadedError,
    withInjectedFailures,
    type FailureSchedule,
} from './testing.ts';

/** The first runs of the live plan: a round robin over conditions, so both harnesses take part. */
const plannedRuns = 6;

const options = (directory: string): LiveOptions => ({
    mode: 'dry-run',
    maxUsd: usdSchema.parse(10),
    judge: false,
    recording: { kind: 'resume', directory },
});

let corpus: readonly CorpusQuestion[] = [];
let allSpecs: readonly RunSpec[] = [];
let plan: readonly RunSpec[] = [];

beforeAll(async () => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        throw new Error('the corpus did not load');
    }
    corpus = loaded.questions;
    allSpecs = planRuns(corpus, { split: liveSplit, entryId: null });
    plan = selectLiveRuns(allSpecs, plannedRuns).runs;
});

const specAt = (specs: readonly RunSpec[], index: number): RunSpec => {
    const spec = specs[index];
    if (spec === undefined) {
        throw new Error(`the plan has no run ${index}`);
    }
    return spec;
};

const ofHarness = (harness: RunSpec['harness'], index: number): RunSpec =>
    specAt(
        plan.filter((spec) => spec.harness === harness),
        index,
    );

type SessionInput = {
    readonly directory: string;
    readonly runs: readonly RunSpec[];
    readonly schedule: FailureSchedule;
    readonly history?: RecordingHistory;
    readonly pause?: NetworkPausePolicy;
    readonly start?: boolean;
    readonly base?: ManifestBase;
};

/** One dry-run session through the live recorder, with failures injected below the observer and the guard. */
const recordDrySession = async ({
    directory,
    runs,
    schedule,
    history = newRecording,
    pause = networkPausePolicy,
    start = true,
    base,
}: SessionInput) => {
    const injected = withInjectedFailures(dryRunModels(false), schedule);
    const resilience = instantResilience({ pause });
    if (start) {
        await startFixtureSet(directory, { replace: true });
    }
    const sessionOptions = options(directory);
    const preflight = decidePreflight(plannedSpend(runs, false), sessionOptions.maxUsd, history.spend.spent);
    const recorded: RecordedSession = await recordToFixtures({
        directory,
        runs,
        models: injected.models,
        cap: sessionOptions.maxUsd,
        manifestBase:
            base ??
            (await manifestBase({
                mode: 'dry-run',
                models: injected.models,
                startedAt: new Date(),
                split: liveSplit,
                plannedRuns,
            })),
        history,
        spendContext: spendContextOf(sessionOptions, preflight.estimate.worstCase),
        resilience: resilience.resilience,
        environment: new Map(),
        onRun: () => undefined,
    });
    return { recorded, calls: injected.log.calls, notices: resilience.notices };
};

const fixturesOf = async (directory: string): Promise<FixtureSet> => {
    const read = await readFixtureSet(directory);
    if (read.kind === 'invalid') {
        throw new Error(read.reason);
    }
    return read.fixtures;
};

const outcomeOf = (fixtures: FixtureSet, runId: RunId) =>
    fixtures.runs.find((run) => run.labels.runId === runId)?.outcome.kind;

const keysOf = (calls: readonly { readonly runKey: BudgetKey }[]): ReadonlySet<BudgetKey> =>
    new Set(calls.map((call) => call.runKey));

/** Span ids are drawn at random per execution; everything else of a replayed run must equal the scripted bed. */
const comparable = (run: ScoredRun) => ({
    ...run,
    verdicts: run.verdicts.map((scored) =>
        scored.verdict.kind === 'fired'
            ? {
                  ...scored,
                  verdict: {
                      ...scored.verdict,
                      evidence: { ...scored.verdict.evidence, spanIds: scored.verdict.evidence.spanIds.length },
                  },
              }
            : scored,
    ),
});

/** The budget key of a run's first attempt and of its first retry, as the recorder charges them. */
const firstKey = ({ runId }: { readonly runId: RunId }): BudgetKey => attemptBudgetKey(runId, firstAttempt);
const retryKey = ({ runId }: { readonly runId: RunId }): BudgetKey =>
    attemptBudgetKey(runId, attemptNumberSchema.parse(2));

const byRunId = (left: ScoredRun, right: ScoredRun) => left.runId.localeCompare(right.runId);

describe('a live session meeting provider failures (dry run, injected failures)', () => {
    test('retries transient failures, catches a worker failure the supervisor swallowed, never retries a request error', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'resilience-'));
        const overloadedRun = ofHarness('single-agent', 0);
        const badRequestRun = ofHarness('single-agent', 1);
        const supervisorRun = ofHarness('multi-agent', 0);
        const { recorded, calls } = await recordDrySession({
            directory: root.path,
            runs: plan,
            schedule: ({ runKey, callIndex }) => {
                if (runKey === firstKey(overloadedRun) && callIndex === 0) {
                    return overloadedError();
                }
                if (runKey === firstKey(badRequestRun) && callIndex === 0) {
                    return badRequestError();
                }
                // The supervisor's first call delegates; the second is the worker's, whose error Mastra swallows.
                return runKey === firstKey(supervisorRun) && callIndex === 1 ? overloadedError() : null;
            },
        });
        const fixtures = await fixturesOf(root.path);
        expect(fixtures.runs).toHaveLength(plannedRuns);
        expect(outcomeOf(fixtures, overloadedRun.runId)).toBe('completed');
        expect(outcomeOf(fixtures, supervisorRun.runId)).toBe('completed');
        expect(outcomeOf(fixtures, badRequestRun.runId)).toBe('failed');
        expect(recorded.outcome).toMatchObject({ recordedRuns: plannedRuns, failedRuns: 1, stoppedEarly: null });
        expect(recorded.spend.retriedRuns.map((run) => [run.runId, run.attempts, run.outcome])).toEqual(
            expect.arrayContaining([
                [overloadedRun.runId, 2, 'completed'],
                [supervisorRun.runId, 2, 'completed'],
            ]),
        );
        expect(recorded.spend.retriedRuns).toHaveLength(2);
        const keys = keysOf(calls());
        expect(keys.has(retryKey(badRequestRun))).toBe(false);
        expect(keys.has(retryKey(overloadedRun))).toBe(true);
        expect(
            calls().filter((call) => call.runKey === firstKey(overloadedRun)),
            'the failed call is not retried inside the framework: the run-level policy owns every retry',
        ).toHaveLength(1);
        expect(
            calls()
                .filter((call) => call.runKey === firstKey(supervisorRun))
                .map((call) => call.callIndex),
            'after the worker failed, the abandoned attempt sends nothing more: its delegation and the failed worker call',
        ).toEqual([0, 1]);

        const replayed = replayFixtures(fixtures, corpus);
        const completedSpecs = plan.filter((spec) => spec.runId !== badRequestRun.runId);
        const bed = await runBed(completedSpecs);
        expect(replayed.scored.toSorted(byRunId).map(comparable)).toEqual(bed.runs.toSorted(byRunId).map(comparable));
    });

    test('pauses for the network during an outage and carries on by itself when it returns', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'resilience-'));
        const runs = plan.filter((spec) => spec.harness === 'single-agent').slice(0, 2);
        const [lostRun, recoveringRun] = [specAt(runs, 0), specAt(runs, 1)];
        // Down for every attempt of the first run and the first two of the second: three failures in a row, then two
        // more, each after a pause, before the network comes back.
        const offlineKeys = new Set([firstKey(recoveringRun), retryKey(recoveringRun)]);
        const { recorded, notices } = await recordDrySession({
            directory: root.path,
            runs,
            schedule: ({ runKey }) =>
                runKey.startsWith(firstKey(lostRun)) || offlineKeys.has(runKey) ? offlineError() : null,
        });
        expect(notices().filter((notice) => notice.kind === 'paused')).toHaveLength(3);
        expect(recorded.outcome.stoppedEarly).toBeNull();
        expect(recorded.outcome.networkPaused).toBeGreaterThan(0);
        const fixtures = await fixturesOf(root.path);
        expect(outcomeOf(fixtures, lostRun.runId)).toBe('failed');
        expect(outcomeOf(fixtures, recoveringRun.runId)).toBe('completed');
        const manifest = sessionManifestSchema.parse(
            JSON.parse(await readFile(path.join(root.path, fixtureFileNames.manifest), 'utf8')),
        );
        expect(manifest.sessions?.[0]?.networkPaused).toBe(recorded.outcome.networkPaused);
    });

    test('stops cleanly once an outage outlasts its limit, leaving a replayable set', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'resilience-'));
        const shortOutageLimit = { ...networkPausePolicy, maxOutageWait: millisecondsSchema.parse(60_000) };
        const { recorded } = await recordDrySession({
            directory: root.path,
            runs: plan,
            schedule: () => offlineError(),
            pause: shortOutageLimit,
        });
        expect(recorded.outcome.stoppedEarly).toMatch(/^NetworkOutageError/);
        expect(recorded.outcome.recordedRuns).toBeLessThan(plannedRuns);
        const fixtures = await fixturesOf(root.path);
        expect(fixtures.manifest.stoppedEarly).toBe(recorded.outcome.stoppedEarly);
        expect(fixtures.runs.every((run) => run.outcome.kind === 'failed')).toBe(true);
    });

    test('an interrupted session resumes: only failed and missing runs are sent, completed runs never again', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'resilience-'));
        const interruptedAfter = 4;
        const failingRun = specAt(plan, 1);
        const first = await recordDrySession({
            directory: root.path,
            runs: plan.slice(0, interruptedAfter),
            schedule: ({ runKey }) => (runKey === firstKey(failingRun) ? badRequestError() : null),
        });
        await appendFile(path.join(root.path, fixtureFileNames.runs), '{"labels":{"runId":"cut short by the inter');
        const originalRuns = await readFile(path.join(root.path, fixtureFileNames.runs), 'utf8');

        const prepared = await prepareResume(root.path, allSpecs, await currentIdentity(options(root.path)));
        if (prepared.kind !== 'ready') {
            throw new Error(`expected a resumable recording, got ${prepared.kind}`);
        }
        const toRecord = prepared.runs.map((spec) => spec.runId);
        expect(toRecord).toEqual([failingRun.runId, ...plan.slice(interruptedAfter).map((spec) => spec.runId)]);
        await keepCompletedRuns(root.path, prepared.recording.completedLines);
        const second = await recordDrySession({
            directory: root.path,
            runs: prepared.runs,
            schedule: () => null,
            history: prepared.history,
            start: false,
            base: prepared.manifestBase,
        });

        const completedBefore = new Set(prepared.recording.completedLines.map((line) => firstKey(line)));
        expect([...keysOf(second.calls())].filter((key) => completedBefore.has(key))).toEqual([]);
        expect([...keysOf(second.calls())].toSorted()).toEqual(prepared.runs.map(firstKey).toSorted());

        const fixtures = await fixturesOf(root.path);
        expect(fixtures.runs.map((run) => run.labels.runId).toSorted()).toEqual(
            plan.map((spec) => spec.runId).toSorted(),
        );
        expect(fixtures.runs.every((run) => run.outcome.kind === 'completed')).toBe(true);
        expect(fixtures.manifest).toMatchObject({ recordedRuns: plannedRuns, failedRuns: 0, stoppedEarly: null });
        expect(await readFile(path.join(root.path, runsBackupFileName), 'utf8')).toBe(originalRuns);

        const manifest = sessionManifestSchema.parse(
            JSON.parse(await readFile(path.join(root.path, fixtureFileNames.manifest), 'utf8')),
        );
        expect(manifest.sessions?.map((session) => session.recordedRuns)).toEqual([interruptedAfter, 3]);
        expect(second.recorded.spend.modelCalls).toBe(first.recorded.spend.modelCalls + second.calls().length);
        expect(second.recorded.spend.spentUsd).toBeGreaterThan(first.recorded.spend.spentUsd);

        const untouched = await stat(path.join(root.path, fixtureFileNames.runs));
        expect(await prepareResume(root.path, allSpecs, await currentIdentity(options(root.path)))).toEqual({
            kind: 'complete',
            completedRuns: plannedRuns,
        });
        expect((await stat(path.join(root.path, fixtureFileNames.runs))).mtimeMs).toBe(untouched.mtimeMs);
    });
});
