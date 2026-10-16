import { countText } from '../../src/command-output/index.ts';
import type { BedReport, ReplaySummary, SplitReport } from './model.ts';
import { catchText, rateCell } from './number-text.ts';
import { markdownRows } from './markdown-rows.ts';
import { readmeAnchors } from './readme-anchors.ts';
import type { EntrySummary } from './render-entries-table.ts';
import {
    cleanRunCount,
    detectorOf,
    falseAlarmTotal,
    heldOutSplitOf,
    revisedOnRecording,
    type SetScoring,
} from './report-queries.ts';

export type RecordedLeadInput = {
    readonly replaySummary: ReplaySummary;
    readonly replayReport: BedReport;
    /** The first scoring on file, before the rules a recording's traces taught were applied. */
    readonly firstScoring: SetScoring;
    readonly offlineHeldOut: SplitReport | undefined;
    readonly offlineProvenance: string;
    readonly entries: readonly EntrySummary[];
};

const recordedCell = (entry: EntrySummary, recorded: SplitReport): string => {
    const detector = detectorOf(recorded, entry.id);
    if (detector !== undefined) {
        return rateCell(detector.falseAlarms);
    }
    return entry.kind === 'ingestion' ? 'not recordable: ingestion calls no model' : 'not scored';
};

const scriptedCell = (entry: EntrySummary, heldOut: SplitReport | undefined): string => {
    const detector = detectorOf(heldOut, entry.id);
    return detector === undefined ? 'not scored' : rateCell(detector.falseAlarms);
};

const firedEntries = (split: SplitReport): readonly string[] =>
    split.detectors.filter((detector) => detector.falseAlarms.events > 0).map((detector) => `\`${detector.entryId}\``);

const outcomeSentence = (recorded: SplitReport): string => {
    const total = falseAlarmTotal(recorded);
    return total === 0
        ? 'Scored offline by `pnpm replay`, no detector fired on a clean recorded run.'
        : `Scored offline by \`pnpm replay\`, detectors fired ${countText(total)} times on clean recorded runs ` +
              `(${firedEntries(recorded).join(', ')}): read each verdict's evidence, as a firing is either a false ` +
              'alarm or a real failure of the model.';
};

const firstScoringSentence = (input: RecordedLeadInput): string => {
    const first = heldOutSplitOf(input.firstScoring.report);
    const current = { summary: input.replaySummary, report: input.replayReport };
    return first === undefined || !revisedOnRecording(input.firstScoring, current)
        ? ''
        : ` The first scoring of the same recording found ${countText(falseAlarmTotal(first))} false alarms in ` +
              `${firedEntries(first).join(' and ')}. Reading those traces changed detector rules (no threshold value was ` +
              'tuned), so the recorded false alarms below are in-sample: a new recording is the out-of-sample check ' +
              `(see [What the live run taught us](${readmeAnchors.whatTheLiveRunTaughtUs})).`;
};

/** Catches on recorded fault runs: only infrastructure faults can be recorded, behaviour faults replace the model. */
const recordedCatchSentence = (recorded: SplitReport): string => {
    const catches = recorded.detectors
        .filter((detector) => detector.caught.trials > 0)
        .map((detector) => `\`${detector.entryId}\` caught ${catchText(detector)}`);
    return catches.length === 0 ? '' : ` On the recorded infrastructure faults, ${catches.join('; ')}.`;
};

/**
 * The README lead: false alarms on traces recorded from a real model, next to the scripted bed's, each labelled
 * with its source. A dry-run set is never presented as recorded.
 */
export const recordedLeadBlock = (input: RecordedLeadInput): string => {
    const recorded = heldOutSplitOf(input.replayReport);
    const { manifest } = input.replaySummary;
    if (input.replaySummary.source !== 'recorded' || recorded === undefined) {
        return 'No recorded set is committed yet: every number below is `scripted`. Record one with `pnpm demo:live`.';
    }
    return [
        `Every run detector was scored on ${countText(input.replaySummary.scoredRuns)} traces recorded from a real ` +
            `model, \`${manifest.models.agent}\`, on ${manifest.recordedOn}: ${countText(cleanRunCount(recorded))} ` +
            'clean runs across ordinary questions, search outages, transient tool errors, empty retrievals and a ' +
            `supervisor with two workers, plus runs under infrastructure faults. ${outcomeSentence(recorded)}` +
            recordedCatchSentence(recorded) +
            firstScoringSentence(input),
        '',
        markdownRows(
            ['Entry', 'False alarms, recorded clean runs (`recorded`)', 'False alarms, held-out bed (`scripted`)'],
            input.entries.map((entry) => [
                `[${entry.id}](src/entries/${entry.id}/README.md)`,
                recordedCell(entry, recorded),
                scriptedCell(entry, input.offlineHeldOut),
            ]),
        ),
        '',
        `Recorded: \`${input.replaySummary.fixture}\`, ${manifest.platform.os} ${manifest.platform.arch}, Node ` +
            `${manifest.platform.node}, scored offline with the bed's own code. Held-out bed: ${input.offlineProvenance}. ` +
            'Rates with Wilson 95% intervals.',
    ].join('\n');
};
