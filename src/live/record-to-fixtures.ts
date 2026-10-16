import type { RunSpec } from '../bed/index.ts';
import type { SpendState } from './budget/model.ts';
import { unfinishedSession, type EnvironmentValues, type ManifestBase } from '../record/index.ts';
import type { Usd } from './budget/model.ts';
import { createSpendLedger } from './budget/session-ledger.ts';
import { millisecondsSchema, type RetriedRun } from './resilience/model.ts';
import type { SessionResilience } from './resilience/session-resilience.ts';
import { recordSession, type RunProgress, type SessionOutcome } from './record-session.ts';
import { writeSessionFiles, type RecordingHistory, type SessionFiles } from './session-files.ts';
import type { SessionModels } from './session-models.ts';
import type { SpendSummary } from './spend-summary.ts';

export type RecordToFixturesInput = {
    /** A fixture directory already opened: started empty, or holding only a resumed recording's completed runs. */
    readonly directory: string;
    readonly runs: readonly RunSpec[];
    readonly models: SessionModels;
    readonly cap: Usd;
    readonly manifestBase: ManifestBase;
    readonly history: RecordingHistory;
    readonly spendContext: SessionFiles['spendContext'];
    readonly resilience: SessionResilience;
    readonly environment: EnvironmentValues;
    /** Called after each run is written, with the recording's spend so far. */
    readonly onRun: (progress: RunProgress, spend: SpendState) => void;
};

export type RecordedSession = { readonly outcome: SessionOutcome; readonly spend: SpendSummary };

/** Reports each run and rewrites the session files after it, marked unfinished until the session's last write. */
const progressReporter = (files: SessionFiles, onRun: RecordToFixturesInput['onRun']) => {
    let failedRuns = 0;
    let retriedRuns: readonly RetriedRun[] = [];
    return async (progress: RunProgress): Promise<void> => {
        failedRuns += progress.failure === null ? 0 : 1;
        retriedRuns = progress.retried === null ? retriedRuns : [...retriedRuns, progress.retried];
        await writeSessionFiles(
            files,
            {
                recordedRuns: progress.recordedRuns,
                failedRuns,
                retriedRuns,
                networkPaused: progress.networkPaused,
                stoppedEarly: unfinishedSession,
            },
            new Date(),
        );
        onRun(progress, files.ledger.read().spend);
    };
};

const nothingRecordedYet: SessionOutcome = {
    recordedRuns: 0,
    failedRuns: 0,
    retriedRuns: [],
    networkPaused: millisecondsSchema.parse(0),
    stoppedEarly: unfinishedSession,
};

/**
 * Records one session into an opened fixture directory: a ledger that starts from the recording's earlier spend, the
 * session files written before the first run (so the manifest always matches `runs.jsonl`, a resumed one included)
 * and after every run, and a final write once the session ends.
 */
export const recordToFixtures = async (input: RecordToFixturesInput): Promise<RecordedSession> => {
    const ledger = createSpendLedger({ cap: input.cap }, input.history.spend);
    const files: SessionFiles = {
        directory: input.directory,
        environment: input.environment,
        ledger,
        manifestBase: input.manifestBase,
        spendContext: input.spendContext,
        history: input.history,
        sessionStartedAt: new Date(),
    };
    await writeSessionFiles(files, nothingRecordedYet, files.sessionStartedAt);
    const outcome = await recordSession(input.runs, {
        fixtureDirectory: input.directory,
        models: input.models,
        ledger,
        environment: input.environment,
        resilience: input.resilience,
        onRun: progressReporter(files, input.onRun),
    });
    return { outcome, spend: await writeSessionFiles(files, outcome, new Date()) };
};
