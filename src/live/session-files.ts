import {
    currentPlatform,
    fixtureFileNames,
    manifestAt,
    writeFixtureJson,
    type EnvironmentValues,
    type ManifestBase,
} from '../record/index.ts';
import { emptySpend, usdSchema, type SpendState } from './budget/model.ts';
import type { SpendLedger } from './budget/session-ledger.ts';
import type { SessionManifest, SessionRecord } from './fixture-manifest.ts';
import type { RetriedRun } from './resilience/model.ts';
import type { SessionOutcome } from './record-session.ts';
import { toSpendSummary, type SpendContext, type SpendSummary } from './spend-summary.ts';

/** What earlier sessions of the recording left: nothing for a new recording, the kept runs for a resumed one. */
export type RecordingHistory = {
    /** Completed runs kept from earlier sessions; this session's lines follow them in `runs.jsonl`. */
    readonly completedRuns: number;
    readonly sessions: readonly SessionRecord[];
    /** What earlier sessions spent: the ledger starts from it, and this session's spend is the difference. */
    readonly spend: SpendState;
    readonly retriedRuns: readonly RetriedRun[];
};

export const newRecording: RecordingHistory = {
    completedRuns: 0,
    sessions: [],
    spend: emptySpend,
    retriedRuns: [],
};

/** Where a session's manifest and spend summary go, and what they are built from. */
export type SessionFiles = {
    readonly directory: string;
    readonly environment: EnvironmentValues;
    readonly manifestBase: ManifestBase;
    readonly ledger: SpendLedger;
    readonly spendContext: SpendContext;
    readonly history: RecordingHistory;
    readonly sessionStartedAt: Date;
};

const sessionRecordOf = (files: SessionFiles, progress: SessionOutcome, at: Date): SessionRecord => ({
    startedAt: files.sessionStartedAt.toISOString(),
    finishedAt: at.toISOString(),
    recordedRuns: progress.recordedRuns,
    failedRuns: progress.failedRuns,
    retriedRuns: progress.retriedRuns.length,
    networkPaused: progress.networkPaused,
    spentUsd: usdSchema.parse(Math.max(0, files.ledger.read().spend.spent - files.history.spend.spent)),
    stoppedEarly: progress.stoppedEarly,
    platform: currentPlatform(),
});

const sessionManifest = (files: SessionFiles, progress: SessionOutcome, at: Date): SessionManifest => ({
    ...manifestAt(
        files.manifestBase,
        {
            recordedRuns: files.history.completedRuns + progress.recordedRuns,
            failedRuns: progress.failedRuns,
            stoppedEarly: progress.stoppedEarly,
        },
        at,
    ),
    sessions: [...files.history.sessions, sessionRecordOf(files, progress, at)],
});

/**
 * Writes `manifest.json` and `spend.json` for the recording as it stands. Called after every run (marked unfinished)
 * and once at the end, so an interrupted session still leaves a replayable, resumable set and a true record of its
 * spend. Both files cover the whole recording: every session and every attempt.
 */
export const writeSessionFiles = async (
    files: SessionFiles,
    progress: SessionOutcome,
    at: Date,
): Promise<SpendSummary> => {
    const spend = toSpendSummary({
        ...files.spendContext,
        spend: files.ledger.read().spend,
        stoppedEarly: progress.stoppedEarly,
        retriedRuns: [...files.history.retriedRuns, ...progress.retriedRuns],
    });
    const { directory, environment } = files;
    await writeFixtureJson(directory, fixtureFileNames.manifest, sessionManifest(files, progress, at), environment);
    await writeFixtureJson(directory, fixtureFileNames.spend, spend, environment);
    return spend;
};
