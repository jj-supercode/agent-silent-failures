import { conditionLabel, rateOf } from '../../src/bed/index.ts';
import { cleanPool, type VariationId } from '../../src/catalog/index.ts';
import { swallowedToolErrorEntryId, type EntryId } from '../../src/entries/index.ts';
import type { BedReport, DetectorReport, Rate, ReplaySummary, SplitReport } from './model.ts';

type HeadlineRow = SplitReport['headline'][number];

/** The rate of a measure that has no runs to count. */
export const noRuns: Rate = rateOf(0, 0);

/** The split a recording holds: live runs are recorded on the held-out split only. */
export const heldOutSplitOf = (report: BedReport): SplitReport | undefined =>
    report.splits.find((split) => split.split === 'held-out');

/** An entry's detector report; `undefined` when the split is missing or never scored the entry. */
export const detectorOf = (split: SplitReport | undefined, entryId: EntryId): DetectorReport | undefined =>
    split?.detectors.find((detector) => detector.entryId === entryId);

/** One rate over several: events and trials summed, the interval recomputed. */
export const pooledRate = (rates: readonly Rate[]): Rate =>
    rateOf(
        rates.reduce((total, rate) => total + rate.events, 0),
        rates.reduce((total, rate) => total + rate.trials, 0),
    );

/** The false alarms pooled over the clean variations `matches` accepts (for example a hard negative's severities). */
export const falseAlarmsWhere = (detector: DetectorReport, matches: (variation: VariationId) => boolean): Rate =>
    pooledRate(
        detector.falseAlarmsByVariation
            .filter(({ variation }) => matches(variation))
            .map(({ falseAlarms }) => falseAlarms),
    );

/** Every false alarm of a split, over all entries. */
export const falseAlarmTotal = (split: SplitReport): number =>
    pooledRate(split.detectors.map((detector) => detector.falseAlarms)).events;

/** One scoring of a committed fixture set: the replay summary and the report it produced. */
export type SetScoring = { readonly summary: ReplaySummary; readonly report: BedReport };

/**
 * Whether detector rules were revised on the current recording: the first scoring on file is of the same set and
 * found other false alarms. From then on the recording's rates are in-sample.
 */
export const revisedOnRecording = (first: SetScoring, current: SetScoring): boolean => {
    const firstSplit = heldOutSplitOf(first.report);
    const currentSplit = heldOutSplitOf(current.report);
    return (
        first.summary.fixture === current.summary.fixture &&
        firstSplit !== undefined &&
        currentSplit !== undefined &&
        falseAlarmTotal(firstSplit) !== falseAlarmTotal(currentSplit)
    );
};

export const falseAlarmsOf = (split: SplitReport | undefined, entryId: EntryId): Rate =>
    detectorOf(split, entryId)?.falseAlarms ?? noRuns;

export const falseAlarmsOnVariation = (split: SplitReport, entryId: EntryId, variation: VariationId): Rate => {
    const detector = detectorOf(split, entryId);
    return detector === undefined ? noRuns : falseAlarmsWhere(detector, (candidate) => candidate === variation);
};

/** The variations a detector names as hard negatives: for swallowed-tool-error, the clean runs that met an error. */
export const hardNegativeVariationsOf = (detector: DetectorReport): ReadonlySet<VariationId> =>
    new Set(detector.falseAlarmsByVariation.filter((entry) => entry.hardNegative).map((entry) => entry.variation));

/** An entry's false alarms on the clean runs that met a search error: swallowed-tool-error's hard negatives. */
export const falseAlarmsUnderErrors = (split: SplitReport, entryId: EntryId): Rate => {
    const swallowed = detectorOf(split, swallowedToolErrorEntryId);
    const detector = detectorOf(split, entryId);
    if (swallowed === undefined || detector === undefined) {
        return noRuns;
    }
    const errorVariations = hardNegativeVariationsOf(swallowed);
    return falseAlarmsWhere(detector, (variation) => errorVariations.has(variation));
};

const cleanLabel = (variation: VariationId): string =>
    conditionLabel({ kind: 'clean', variation, hardNegativeFor: [] });

/** The headline row of one clean variation. */
export const cleanRowOf = (split: SplitReport, variation: VariationId): HeadlineRow | undefined =>
    split.headline.find((row) => row.condition === cleanLabel(variation));

/** Every clean variation's headline row: the runs where any firing is a false alarm or a real model failure. */
export const cleanRowsOf = (split: SplitReport): readonly HeadlineRow[] => {
    const labels = new Set(cleanPool.map((variation) => cleanLabel(variation.id)));
    return split.headline.filter((row) => labels.has(row.condition));
};

export const cleanRunCount = (split: SplitReport): number =>
    cleanRowsOf(split).reduce((total, row) => total + row.agentRuns, 0);

export const goldFoundOn = (split: SplitReport, variation: VariationId): Rate =>
    cleanRowOf(split, variation)?.goldAnswerFound ?? noRuns;

export const goldFoundOnCleanRuns = (split: SplitReport): Rate =>
    pooledRate(cleanRowsOf(split).map((row) => row.goldAnswerFound));
