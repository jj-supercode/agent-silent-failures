import type { CommandEnvironment } from './command-environment.ts';
import type { FinishedReport } from './finished-report.ts';
import {
    humanFailureLines,
    humanHeaderLines,
    humanProgressLine,
    humanSectionLines,
    humanSummaryLines,
    humanWarningLines,
} from './human-lines.ts';
import { eventLine, failureEvent, progressEvent, startEvent, summaryEvent, warningEvent } from './json-events.ts';
import type { CommandFailure, CommandHeader, OutputMode } from './model.ts';
import {
    plainFailureLines,
    plainHeaderLines,
    plainProgressLine,
    plainSectionLines,
    plainSummaryLines,
    plainWarningLines,
} from './plain-lines.ts';
import type { ProgressState } from './progress.ts';
import { textStyleFor } from './text-style.ts';

/**
 * What one mode does with each kind of output. `progress` is called at every tenth of the work. A mode that rewrites
 * one line in place instead gives `rewrittenProgressLine`, called on every update (the caller throttles it), which
 * returns the line to draw.
 */
export type ModeWriter = {
    readonly header: (header: CommandHeader) => void;
    readonly section: (title: string, lines: readonly string[]) => void;
    readonly warning: (message: string, details: readonly string[]) => void;
    readonly failure: (failure: CommandFailure) => void;
    readonly progress: (state: ProgressState) => void;
    readonly rewrittenProgressLine: ((state: ProgressState) => string) | null;
    readonly summary: (report: FinishedReport) => void;
};

const linesTo =
    (sink: CommandEnvironment['stdout']) =>
    (lines: readonly string[]): void => {
        sink.write(lines.map((line) => `${line}\n`).join(''));
    };

const humanWriter = (mode: Extract<OutputMode, { kind: 'human' }>, environment: CommandEnvironment): ModeWriter => {
    const style = textStyleFor(mode.color);
    const out = linesTo(environment.stdout);
    const err = linesTo(environment.stderr);
    return {
        header: (header) => out(humanHeaderLines(header, style)),
        section: (title, lines) => out(humanSectionLines(title, lines, style)),
        warning: (message, details) => err(humanWarningLines(message, details, style)),
        failure: (failure) => err(humanFailureLines(failure, style)),
        progress: (state) => err([humanProgressLine(state, environment.now(), style)]),
        rewrittenProgressLine: mode.rewritesProgress
            ? (state) => humanProgressLine(state, environment.now(), style)
            : null,
        summary: (report) => out(humanSummaryLines(report, style)),
    };
};

const plainWriter = (environment: CommandEnvironment): ModeWriter => {
    const out = linesTo(environment.stdout);
    return {
        header: (header) => out(plainHeaderLines(header)),
        section: (title, lines) => out(plainSectionLines(title, lines)),
        warning: (message, details) => out(plainWarningLines(message, details)),
        failure: (failure) => out(plainFailureLines(failure)),
        progress: (state) => out([plainProgressLine(state, environment.now())]),
        rewrittenProgressLine: null,
        summary: (report) => out(plainSummaryLines(report)),
    };
};

/** Sections are for reading; their facts reach JSON through the start and summary events. */
const jsonWriter = (command: string, environment: CommandEnvironment, startedAt: number): ModeWriter => {
    const origin = () => ({ command, elapsedMs: Math.max(0, environment.now() - startedAt) });
    const out = linesTo(environment.stdout);
    return {
        header: (header) => out([eventLine(startEvent(origin(), header))]),
        section: () => undefined,
        warning: (message, details) => out([eventLine(warningEvent(origin(), message, details))]),
        failure: (failure) => out([eventLine(failureEvent(origin(), failure))]),
        progress: (state) => out([eventLine(progressEvent(origin(), state, environment.now()))]),
        rewrittenProgressLine: null,
        summary: (report) => out([eventLine(summaryEvent(origin(), report))]),
    };
};

export const modeWriter = (
    command: string,
    mode: OutputMode,
    environment: CommandEnvironment,
    startedAt: number,
): ModeWriter => {
    switch (mode.kind) {
        case 'human':
            return humanWriter(mode, environment);
        case 'plain':
            return plainWriter(environment);
        case 'json':
            return jsonWriter(command, environment, startedAt);
        default:
            return mode satisfies never;
    }
};
