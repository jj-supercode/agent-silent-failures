import type { EntryId } from '../../src/entries/index.ts';
import { changedEntries, searchOutage } from './lesson-subjects.ts';
import type { BedReport, SplitReport } from './model.ts';
import { catchText, rateCell } from './number-text.ts';
import { markdownRows } from './markdown-rows.ts';
import {
    detectorOf,
    falseAlarmsOf,
    goldFoundOn,
    goldFoundOnCleanRuns,
    heldOutSplitOf,
    type SetScoring,
} from './report-queries.ts';

/** One scoring of a recording: its summary, its report, and the scripted bed report of the same code. */
export type Scoring = SetScoring & { readonly offline: BedReport };

/** Two scorings of the same recording, as held-out splits; the offline splits may be missing. */
export type ScoringComparison = {
    readonly first: SplitReport;
    readonly current: SplitReport;
    readonly firstOffline: SplitReport | undefined;
    readonly currentOffline: SplitReport | undefined;
};

export type ComparisonResult =
    | { readonly kind: 'comparable'; readonly comparison: ScoringComparison }
    | { readonly kind: 'not-comparable'; readonly reason: string };

/** Pairs two scorings when both are of the same committed set and both hold a held-out split. */
export const compareScorings = (first: Scoring, current: Scoring): ComparisonResult => {
    if (first.summary.fixture !== current.summary.fixture) {
        return {
            kind: 'not-comparable',
            reason: 'The first scoring on file is of another recorded set, so there is no before and after to show.',
        };
    }
    const firstSplit = heldOutSplitOf(first.report);
    const currentSplit = heldOutSplitOf(current.report);
    return firstSplit === undefined || currentSplit === undefined
        ? { kind: 'not-comparable', reason: 'A scoring on file has no held-out split, so there is nothing to compare.' }
        : {
              kind: 'comparable',
              comparison: {
                  first: firstSplit,
                  current: currentSplit,
                  firstOffline: heldOutSplitOf(first.offline),
                  currentOffline: heldOutSplitOf(current.offline),
              },
          };
};

const recordedRows = ({ first, current }: ScoringComparison): readonly (readonly string[])[] => [
    ...current.detectors.map((detector) => [
        `\`${detector.entryId}\` false alarms, recorded clean runs (in-sample)`,
        rateCell(falseAlarmsOf(first, detector.entryId)),
        rateCell(detector.falseAlarms),
    ]),
    [
        `gold answer found, recorded clean \`${searchOutage}\` (in-sample)`,
        rateCell(goldFoundOn(first, searchOutage)),
        rateCell(goldFoundOn(current, searchOutage)),
    ],
    [
        'gold answer found, all recorded clean runs (in-sample)',
        rateCell(goldFoundOnCleanRuns(first)),
        rateCell(goldFoundOnCleanRuns(current)),
    ],
];

const catchCell = (split: SplitReport | undefined, entryId: EntryId): string => {
    const detector = detectorOf(split, entryId);
    return detector === undefined ? 'not scored' : catchText(detector);
};

const scriptedRows = ({ firstOffline, currentOffline }: ScoringComparison): readonly (readonly string[])[] =>
    changedEntries.map((entryId) => [
        `\`${entryId}\` catch rate, held-out bed (\`scripted\`)`,
        catchCell(firstOffline, entryId),
        catchCell(currentOffline, entryId),
    ]);

/** Recorded false alarms and gold answers, then the changed entries' scripted catch rates, first against now. */
export const comparisonTable = (comparison: ScoringComparison): string =>
    markdownRows(['Measure', 'First scoring', 'Now'], [...recordedRows(comparison), ...scriptedRows(comparison)]);

const caughtOf = (split: SplitReport | undefined, entryId: EntryId) => detectorOf(split, entryId)?.caught;

const quoted = (entryIds: readonly EntryId[]): string => entryIds.map((entryId) => `\`${entryId}\``).join(' and ');

/** Whether the exemptions cost catches: each changed entry's scripted catch share, before against now. */
export const catchSentence = ({ firstOffline, currentOffline }: ScoringComparison): string => {
    const dropped = changedEntries.filter((entryId) => {
        const before = caughtOf(firstOffline, entryId)?.share ?? null;
        const now = caughtOf(currentOffline, entryId)?.share ?? null;
        return before === null || now === null || now < before;
    });
    if (dropped.length > 0) {
        return `On the scripted bed, the catch rate of ${quoted(dropped)} dropped or is missing: read the table.`;
    }
    const grown = changedEntries.filter(
        (entryId) => (caughtOf(currentOffline, entryId)?.trials ?? 0) > (caughtOf(firstOffline, entryId)?.trials ?? 0),
    );
    return (
        'On the scripted bed, the changed entries catch at least the same share of their faults as before, so the ' +
        'new exemptions did not blunt detection' +
        (grown.length === 0 ? '.' : ` (the counts of ${quoted(grown)} include new fault runs).`)
    );
};
