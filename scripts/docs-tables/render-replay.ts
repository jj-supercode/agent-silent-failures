import type { BedReport, FaultCatch, ReplaySummary } from './model.ts';
import { catchText, rateCell } from './number-text.ts';
import { markdownRows } from './markdown-rows.ts';
import type { EntrySummary } from './render-entries-table.ts';
import { readmeAnchors } from './readme-anchors.ts';

const setDescription = (summary: ReplaySummary): string => {
    switch (summary.manifest.mode) {
        case 'live':
            return `recorded from \`${summary.manifest.models.agent}\` on ${summary.manifest.recordedOn}`;
        case 'dry-run':
            return (
                `a dry run of the recording pipeline on ${summary.manifest.recordedOn}, driven by the scripted ` +
                'policies instead of a model, so these numbers equal the scripted bed on the same runs'
            );
        default:
            return summary.manifest.mode satisfies never;
    }
};

/** A behaviour fault replaces the model's own policy, so a recording holds none of its runs. */
const recordedCatchCell = (faultCatch: FaultCatch): string =>
    faultCatch.caught.trials === 0 ? 'no recorded fault runs' : catchText(faultCatch);

const unscoredEntriesLine = (entries: readonly EntrySummary[], scoredIds: ReadonlySet<string>): string => {
    const unscored = entries.filter((entry) => !scoredIds.has(entry.id));
    const ingestion = unscored.filter((entry) => entry.kind === 'ingestion').map((entry) => `\`${entry.id}\``);
    const other = unscored.filter((entry) => entry.kind === 'run').map((entry) => `\`${entry.id}\``);
    return [
        ingestion.length === 0
            ? ''
            : `Not in this table: ${ingestion.join(', ')}, an ingestion entry; ingestion calls no model, so a ` +
              'recording holds no ingestion traces and its numbers come from the scripted bed alone.',
        other.length === 0 ? '' : `Run entries the set did not score: ${other.join(', ')}.`,
    ]
        .filter((line) => line.length > 0)
        .join(' ');
};

export type ReplayBlockInput = {
    readonly summary: ReplaySummary;
    readonly report: BedReport;
    readonly entries: readonly EntrySummary[];
    /** Detector rules were revised after reading this recording's first scoring (`revisedOnRecording`). */
    readonly inSample: boolean;
};

const inSampleSentence =
    'Detector rules were revised after reading the first scoring of this recording, so its false alarms are ' +
    'in-sample: a new recording is the out-of-sample check ' +
    `(see [What the live run taught us](${readmeAnchors.whatTheLiveRunTaughtUs})).`;

/** What `pnpm replay` scored, labelled with its source, and each scored entry's false alarms and catches on it. */
export const replayBlock = ({ summary, report, entries, inSample }: ReplayBlockInput): string => {
    const { platform } = summary.manifest;
    const detectors = report.splits.flatMap((split) => split.detectors);
    const unscored = unscoredEntriesLine(entries, new Set(detectors.map((detector) => detector.entryId)));
    return [
        `Committed set \`${summary.fixture}\`: ${setDescription(summary)}. Source label: \`${summary.source}\`. ` +
            `Recorded on ${platform.os} ${platform.arch}, Node ${platform.node}. ${summary.scoredRuns} of ` +
            `${summary.manifest.plannedRuns} planned runs scored, ${summary.manifest.failedRuns} failed while ` +
            `recording, ${summary.unscorable.length} unscorable.` +
            (inSample ? ` ${inSampleSentence}` : ''),
        '',
        markdownRows(
            [
                'Entry',
                inSample ? 'False alarms on clean runs (in-sample)' : 'False alarms on clean runs',
                'Catch rate on recorded faults',
            ],
            detectors.map((detector) => [
                detector.entryId,
                rateCell(detector.falseAlarms),
                recordedCatchCell(detector),
            ]),
        ),
        ...(unscored.length === 0 ? [] : ['', unscored]),
        '',
        "A fault that replaces the model's own behaviour has no live counterpart, so it has no recorded runs; its " +
            'catch rate comes from the scripted bed.',
    ].join('\n');
};
