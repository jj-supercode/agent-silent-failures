import { factLabel } from './fact-label.ts';
import type { FinishedReport } from './finished-report.ts';
import type { CommandFailure, CommandHeader } from './model.ts';
import { durationText, mebibytesText, usdText } from './number-text.ts';
import { doneShare, remainingMilliseconds, type ProgressState } from './progress.ts';

// Lines for a log, CI or a coding agent: no ANSI, no rewriting, and every line outside a section starts with a
// stable lowercase prefix (`start:`, `progress:`, `warning:`, `failure:`, `summary:`, `exit:` ...).

const factLine = (name: string, value: string): string => `${factLabel(name)}: ${value}`;

export const plainHeaderLines = (header: CommandHeader): readonly string[] => [
    `start: ${header.title}: ${header.description}`,
    ...(header.measures === null ? [] : [factLine('measures', header.measures)]),
    ...header.facts.map(([name, value]) => factLine(name, value)),
];

/** Blank lines stay blank: no trailing spaces in a log. */
const indented = (line: string): string => (line === '' ? '' : `  ${line}`);

/** A section keeps its rows (tables stay aligned) under a `section:` line. */
export const plainSectionLines = (title: string, lines: readonly string[]): readonly string[] => [
    `section: ${title}`,
    ...lines.map(indented),
];

export const plainWarningLines = (message: string, details: readonly string[]): readonly string[] => [
    `warning: ${message}${details.length === 0 ? '' : `: ${details.join('; ')}`}`,
];

export const plainFailureLines = (failure: CommandFailure): readonly string[] => [
    `failure: ${failure.what}${failure.subject === null ? '' : ` (${failure.subject})`}: ${failure.why}` +
        (failure.fix === null ? '' : `; fix: ${failure.fix}`),
];

export const plainProgressLine = (state: ProgressState, now: number): string => {
    const remaining = remainingMilliseconds(state, now);
    return (
        `progress: ${Math.floor(doneShare(state) * 100)}% ${state.done}/${state.total} ${state.unit}, ` +
        `${state.failed} failed, ${durationText(now - state.startedAt)} elapsed` +
        (remaining === null ? '' : `, ETA ${durationText(remaining)}`) +
        (state.spendUsd === null ? '' : `, spend ${usdText(state.spendUsd)}`)
    );
};

export const plainSummaryLines = (report: FinishedReport): readonly string[] => [
    `summary: ${report.headline}`,
    `time: ${durationText(report.elapsedMs)}, peak RSS ${mebibytesText(report.peakRssBytes)}`,
    ...(report.spendUsd === null ? [] : [`spend: ${usdText(report.spendUsd)}`]),
    ...report.outputs.map((output) => `wrote: ${output}`),
    ...report.next.map((step) => `next: ${step.command} (${step.purpose})`),
    `exit: ${report.exit.code} (${report.exit.meaning})`,
];
