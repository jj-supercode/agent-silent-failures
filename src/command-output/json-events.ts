import { isSuccess, type FinishedReport } from './finished-report.ts';
import {
    eventSchemaVersion,
    type CommandEvent,
    type CommandFailure,
    type CommandHeader,
    type SummaryEvent,
} from './model.ts';
import { remainingMilliseconds, type ProgressState } from './progress.ts';

// Events for `--json`: exact values, one JSON object per line.

/** Sub-millisecond digits are clock noise, not information. */
const wholeMilliseconds = (milliseconds: number | null): number | null =>
    milliseconds === null ? null : Math.round(milliseconds);

type EventOrigin = { readonly command: string; readonly elapsedMs: number };

const base = (origin: EventOrigin) =>
    ({
        schemaVersion: eventSchemaVersion,
        command: origin.command,
        elapsedMs: Math.round(origin.elapsedMs),
    }) as const;

export const startEvent = (origin: EventOrigin, header: CommandHeader): CommandEvent => ({
    ...base(origin),
    event: 'start',
    title: header.title,
    description: header.description,
    measures: header.measures,
    total: header.total,
    unit: header.unit,
    facts: Object.fromEntries(header.facts),
});

export const progressEvent = (origin: EventOrigin, state: ProgressState, now: number): CommandEvent => ({
    ...base(origin),
    event: 'progress',
    done: state.done,
    total: state.total,
    failed: state.failed,
    unit: state.unit,
    etaMs: wholeMilliseconds(remainingMilliseconds(state, now)),
    spendUsd: state.spendUsd,
});

export const warningEvent = (origin: EventOrigin, message: string, details: readonly string[]): CommandEvent => ({
    ...base(origin),
    event: 'warning',
    message,
    details: [...details],
});

export const failureEvent = (origin: EventOrigin, failure: CommandFailure): CommandEvent => ({
    ...base(origin),
    event: 'failure',
    ...failure,
});

export const summaryEvent = (origin: EventOrigin, report: FinishedReport): SummaryEvent => ({
    ...base(origin),
    event: 'summary',
    ok: isSuccess(report),
    exitCode: report.exit.code,
    exitMeaning: report.exit.meaning,
    headline: report.headline,
    counts: { ...report.counts },
    rates: [...report.rates],
    spendUsd: report.spendUsd,
    outputs: [...report.outputs],
    next: [...report.next],
    peakRssBytes: report.peakRssBytes,
});

export const eventLine = (event: CommandEvent): string => JSON.stringify(event);
