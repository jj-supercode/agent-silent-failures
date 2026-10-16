import type { CommandEnvironment } from './command-environment.ts';
import { modeWriter } from './mode-writers.ts';
import type { CommandFailure, CommandHeader, CommandReport, OutputMode, ProgressUpdate } from './model.ts';
import { advanceProgress, crossedCheckpoint, redrawDue, startProgress, type ProgressState } from './progress.ts';
import { textStyleFor, type TextStyle } from './text-style.ts';

export type ProgressTracker = { readonly update: (update: ProgressUpdate) => void } & Disposable;

/** Everything a command prints goes through here, so the three modes stay consistent. */
export type CommandOutput = {
    readonly mode: OutputMode;
    /** Styles for cells a command builds itself; the identity outside a coloured terminal. */
    readonly style: TextStyle;
    readonly start: (header: CommandHeader) => void;
    readonly section: (title: string, lines: readonly string[]) => void;
    readonly warning: (message: string, details: readonly string[]) => void;
    readonly failure: (failure: CommandFailure) => void;
    /** Reports finished units; disposing it clears a rewritten progress line. */
    readonly trackProgress: (total: number, unit: string) => ProgressTracker;
    readonly finish: (report: CommandReport) => void;
};

const clearLine = '\r\u001b[2K';

export const createCommandOutput = (
    command: string,
    mode: OutputMode,
    environment: CommandEnvironment,
): CommandOutput => {
    const startedAt = environment.now();
    const writer = modeWriter(command, mode, environment, startedAt);
    // Mutable state stays in this edge: the progress line on screen (other lines clear it and draw it again) and,
    // per tracker, its progress and when it was last drawn.
    let shownProgress: string | null = null;
    const clearProgress = (): void => {
        if (shownProgress !== null) {
            environment.stderr.write(clearLine);
        }
    };
    const removeProgress = (): void => {
        clearProgress();
        shownProgress = null;
    };
    const restoreProgress = (): void => {
        if (shownProgress !== null) {
            environment.stderr.write(shownProgress);
        }
    };
    const aroundProgress =
        <Args extends readonly unknown[]>(print: (...args: Args) => void) =>
        (...args: Args): void => {
            clearProgress();
            print(...args);
            restoreProgress();
        };
    const failure = aroundProgress(writer.failure);

    const trackProgress = (total: number, unit: string): ProgressTracker => {
        let state: ProgressState = startProgress(total, unit, environment.now());
        let drawnAt = Number.NEGATIVE_INFINITY;
        const draw = (line: string): void => {
            clearProgress();
            shownProgress = line;
            environment.stderr.write(line);
            drawnAt = environment.now();
        };
        return {
            update: (update) => {
                const before = state;
                state = advanceProgress(state, update);
                if (update.kind === 'failed') {
                    failure(update.failure);
                }
                const rewrite = writer.rewrittenProgressLine;
                if (rewrite === null) {
                    if (crossedCheckpoint(before, state)) {
                        writer.progress(state);
                    }
                } else if (redrawDue(state, environment.now() - drawnAt)) {
                    draw(rewrite(state));
                }
            },
            [Symbol.dispose]: removeProgress,
        };
    };

    return {
        mode,
        style: textStyleFor(mode.kind === 'human' && mode.color),
        start: aroundProgress(writer.header),
        section: aroundProgress(writer.section),
        warning: aroundProgress(writer.warning),
        failure,
        trackProgress,
        finish: (report) => {
            removeProgress();
            writer.summary({
                ...report,
                elapsedMs: Math.max(0, environment.now() - startedAt),
                peakRssBytes: environment.peakRssBytes(),
            });
        },
    };
};
