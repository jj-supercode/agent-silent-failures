import {
    appendRecordedRun,
    fixtureFileNames,
    manifestAt,
    unfinishedSession,
    writeFixtureJson,
    writeFixtureManifest,
    type EnvironmentValues,
    type ManifestBase,
    type RecordedRunInput,
    type RecordingProgress,
} from '../../record/index.ts';
import type { DemonstrationSpend } from './model.ts';

/** An opened fixture directory and what its manifest says before any run. */
export type MatrixRecording = {
    readonly directory: string;
    readonly environment: EnvironmentValues;
    readonly manifestBase: ManifestBase;
};

/** The manifest and spend summary as the recording stands; rewritten after every line, so an interrupt replays. */
export const writeRecordingFiles = async (
    { directory, environment, manifestBase }: MatrixRecording,
    progress: RecordingProgress,
    spend: DemonstrationSpend | null,
): Promise<void> => {
    await writeFixtureManifest(directory, manifestAt(manifestBase, progress, new Date()), environment);
    if (spend !== null) {
        await writeFixtureJson(directory, fixtureFileNames.spend, spend, environment);
    }
};

export type LineOutcome = 'completed' | 'failed';

/** Appends one line; a failed run and a line withheld by the sensitive-string scan both count as failed. */
export const appendLine = async (recording: MatrixRecording, run: RecordedRunInput): Promise<LineOutcome> => {
    const appended = await appendRecordedRun(recording.directory, run, recording.environment);
    return run.outcome.kind === 'failed' || appended.kind === 'withheld' ? 'failed' : 'completed';
};

export const noLinesYet: RecordingProgress = { recordedRuns: 0, failedRuns: 0, stoppedEarly: unfinishedSession };

/** The progress after one more line; still unfinished until the session says otherwise. */
export const withLine = (progress: RecordingProgress, line: LineOutcome): RecordingProgress => ({
    recordedRuns: progress.recordedRuns + 1,
    failedRuns: progress.failedRuns + (line === 'failed' ? 1 : 0),
    stoppedEarly: unfinishedSession,
});

/** The one mutable cell of a recording session: the lines written so far, as the manifest reports them. */
export type LineTally = {
    readonly read: () => RecordingProgress;
    readonly add: (line: LineOutcome) => RecordingProgress;
};

export const createLineTally = (): LineTally => {
    let progress = noLinesYet;
    return {
        read: () => progress,
        add: (line) => {
            progress = withLine(progress, line);
            return progress;
        },
    };
};
