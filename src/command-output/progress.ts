import type { ProgressUpdate } from './model.ts';

/** Where a tracked command stands; pure, advanced one finished unit at a time. */
export type ProgressState = {
    readonly total: number;
    readonly unit: string;
    readonly done: number;
    readonly failed: number;
    readonly spendUsd: number | null;
    readonly startedAt: number;
};

export const startProgress = (total: number, unit: string, startedAt: number): ProgressState => ({
    total,
    unit,
    done: 0,
    failed: 0,
    spendUsd: null,
    startedAt,
});

export const advanceProgress = (state: ProgressState, update: ProgressUpdate): ProgressState => ({
    ...state,
    done: state.done + 1,
    failed: state.failed + (update.kind === 'failed' ? 1 : 0),
    spendUsd: update.spendUsd ?? state.spendUsd,
});

/** Linear in finished units; `null` until one has finished and once all have. */
export const remainingMilliseconds = (state: ProgressState, now: number): number | null =>
    state.done === 0 || state.done >= state.total
        ? null
        : ((now - state.startedAt) / state.done) * (state.total - state.done);

const checkpointCount = 10;

/** Which tenth of the work is done: plain and JSON output report once per tenth. */
const checkpointOf = (state: ProgressState): number =>
    state.total === 0 ? checkpointCount : Math.floor((state.done * checkpointCount) / state.total);

/** True when an update moved the work into the next tenth (the last unit always does). */
export const crossedCheckpoint = (before: ProgressState, after: ProgressState): boolean =>
    checkpointOf(after) > checkpointOf(before);

/** A rewritten line is redrawn at most this often, so a fast loop does not flood the terminal. */
export const redrawIntervalMilliseconds = 100;

/** The rewritten line is due after the interval, and always for the last unit, so the final count is shown. */
export const redrawDue = (state: ProgressState, sinceLastDrawMilliseconds: number): boolean =>
    state.done >= state.total || sinceLastDrawMilliseconds >= redrawIntervalMilliseconds;

export const doneShare = (state: ProgressState): number => (state.total === 0 ? 1 : state.done / state.total);
