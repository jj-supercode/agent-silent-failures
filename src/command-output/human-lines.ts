import { capitalisedFactLabel } from './fact-label.ts';
import { isSuccess, type FinishedReport } from './finished-report.ts';
import type { CommandFailure, CommandHeader, NextStep } from './model.ts';
import { countText, durationText, mebibytesText, usdText } from './number-text.ts';
import { doneShare, remainingMilliseconds, type ProgressState } from './progress.ts';
import type { TextStyle } from './text-style.ts';

// Lines for a person at a terminal: a titled header, labelled rows, one progress bar, a closing summary.

const indent = '  ';
const labelWidth = 10;

const labelled = (label: string, value: string, style: TextStyle): string =>
    `${indent}${style.label(label.padEnd(labelWidth))} ${value}`;

/** Several values under one label: the label on the first line only. */
const labelledList = (label: string, values: readonly string[], style: TextStyle): readonly string[] =>
    values.map((value, index) => labelled(index === 0 ? label : '', value, style));

export const humanHeaderLines = (header: CommandHeader, style: TextStyle): readonly string[] => [
    style.title(header.title),
    `${indent}${header.description}`,
    ...(header.measures === null ? [] : [labelled('Measures', header.measures, style)]),
    ...header.facts.map(([name, value]) => labelled(capitalisedFactLabel(name), value, style)),
    '',
];

export const humanSectionLines = (title: string, lines: readonly string[], style: TextStyle): readonly string[] => [
    style.title(title),
    ...lines.map((line) => (line === '' ? '' : `${indent}${line}`)),
    '',
];

export const humanWarningLines = (message: string, details: readonly string[], style: TextStyle): readonly string[] => [
    `${style.warning('▲')} ${message}`,
    ...details.map((detail) => `${indent}${style.muted(detail)}`),
];

export const humanFailureLines = (failure: CommandFailure, style: TextStyle): readonly string[] => [
    `${style.failure('✖')} ${failure.what}${failure.subject === null ? '' : ` ${style.muted(failure.subject)}`}`,
    `${indent}${failure.why}`,
    ...(failure.fix === null ? [] : [`${indent}${style.label('fix')} ${failure.fix}`]),
];

const barWidth = 24;

const progressBar = (state: ProgressState): string => {
    const filled = Math.round(doneShare(state) * barWidth);
    return `${'█'.repeat(filled)}${'░'.repeat(barWidth - filled)}`;
};

export const humanProgressLine = (state: ProgressState, now: number, style: TextStyle): string => {
    const remaining = remainingMilliseconds(state, now);
    return [
        `${indent}${progressBar(state)} ${`${Math.floor(doneShare(state) * 100)}%`.padStart(4)}`,
        `${countText(state.done)}/${countText(state.total)} ${state.unit}`,
        state.failed === 0 ? '0 failed' : style.failure(`${countText(state.failed)} failed`),
        `${durationText(now - state.startedAt)} elapsed`,
        ...(remaining === null ? [] : [`ETA ${durationText(remaining)}`]),
        ...(state.spendUsd === null ? [] : [usdText(state.spendUsd)]),
    ].join(style.muted(' · '));
};

const nextStepWidth = (next: readonly NextStep[]): number => Math.max(0, ...next.map((step) => step.command.length));

const nextStepLines = (next: readonly NextStep[], style: TextStyle): readonly string[] =>
    labelledList(
        'Next',
        next.map((step) => `${style.command(step.command.padEnd(nextStepWidth(next)))}  ${step.purpose}`),
        style,
    );

export const humanSummaryLines = (report: FinishedReport, style: TextStyle): readonly string[] => [
    isSuccess(report) ? `${style.success('✔')} ${report.headline}` : `${style.failure('✖')} ${report.headline}`,
    labelled('Time', `${durationText(report.elapsedMs)} · peak RSS ${mebibytesText(report.peakRssBytes)}`, style),
    ...(report.spendUsd === null ? [] : [labelled('Spend', usdText(report.spendUsd), style)]),
    ...labelledList('Wrote', report.outputs, style),
    ...nextStepLines(report.next, style),
    labelled('Exit', `${report.exit.code} ${style.muted(report.exit.meaning)}`, style),
];
