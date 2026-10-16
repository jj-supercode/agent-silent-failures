import type { EntryId } from '../../entries/index.ts';
import type { ScoredRun, SensitivityPoint, SweepPoint, ThresholdSensitivity } from '../model.ts';
import { rateWhere } from '../stats/rate.ts';
import { cleanRuns, isNotExpressed, ownFaultRuns, scoredBy, verdictOf } from './run-queries.ts';

const outcomeAt = (run: ScoredRun, entryId: EntryId, threshold: string, value: number): SweepPoint['outcome'] | null =>
    verdictOf(run, entryId)?.sweep.find((point) => point.threshold === threshold && point.value === value)?.outcome ??
    null;

const sensitivityPoint = (
    runs: { readonly expressedFaulted: readonly ScoredRun[]; readonly clean: readonly ScoredRun[] },
    entryId: EntryId,
    threshold: string,
    point: Pick<SweepPoint, 'value' | 'isDefault'>,
): SensitivityPoint => {
    const firedHere = (run: ScoredRun): boolean => outcomeAt(run, entryId, threshold, point.value) === 'fired';
    const judgedClean = runs.clean.filter((run) => {
        const outcome = outcomeAt(run, entryId, threshold, point.value);
        return outcome !== null && outcome !== 'not-applicable';
    });
    return {
        value: point.value,
        isDefault: point.isDefault,
        caught: rateWhere(runs.expressedFaulted, firedHere),
        falseAlarms: rateWhere(judgedClean, firedHere),
    };
};

/**
 * How catch and false-alarm rates move as one threshold sweeps its range, every other threshold at its default.
 * Each value has its own denominators: catches over own-fault runs where the fault took effect (a not-applicable
 * verdict is a miss), false alarms over the clean runs the detector judged at that value.
 */
export const thresholdSensitivity = (runs: readonly ScoredRun[], entryId: EntryId): readonly ThresholdSensitivity[] => {
    const scored = scoredBy(runs, entryId);
    const groups = {
        expressedFaulted: ownFaultRuns(scored, entryId).filter((run) => !isNotExpressed(run)),
        clean: cleanRuns(scored),
    };
    const sweptPoints = scored.flatMap((run) => verdictOf(run, entryId)?.sweep ?? []);
    return [...Map.groupBy(sweptPoints, (point) => point.threshold)].map(([threshold, points]) => ({
        entryId,
        threshold,
        points: [...Map.groupBy(points, (point) => point.value)]
            .map(([value, atValue]) => ({ value, isDefault: atValue.some((point) => point.isDefault) }))
            .toSorted((left, right) => left.value - right.value)
            .map((point) => sensitivityPoint(groups, entryId, threshold, point)),
    }));
};
