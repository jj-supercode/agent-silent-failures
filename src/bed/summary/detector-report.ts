import type { EntryId } from '../../entries/index.ts';
import type { DetectorReport, FaultCatch, ScoredRun, SeverityRate, VariationRate } from '../model.ts';
import { rateWhere } from '../stats/rate.ts';
import {
    byCondition,
    cleanRuns,
    firedFor,
    isApplicableFor,
    isNotExpressed,
    ownFaultRuns,
    scoredBy,
} from './run-queries.ts';

/** Both catch rates over one set of own-fault runs (all, and those where the fault took effect) and disagreements. */
const catchRates = (faulted: readonly ScoredRun[], entryId: EntryId): FaultCatch => {
    const expressed = faulted.filter((run) => !isNotExpressed(run));
    const notExpressed = faulted.filter(isNotExpressed);
    return {
        caught: rateWhere(faulted, firedFor(entryId)),
        caughtWhenExpressed: rateWhere(expressed, firedFor(entryId)),
        notExpressed: notExpressed.length,
        firedWhenNotExpressed: notExpressed.filter(firedFor(entryId)).length,
    };
};

const severityRates = (faulted: readonly ScoredRun[], entryId: EntryId): readonly SeverityRate[] =>
    byCondition(faulted).flatMap(([, items]) => {
        const [first] = items;
        return first?.condition.kind === 'faulted'
            ? [
                  {
                      faultId: first.condition.faultId,
                      severity: first.condition.severity,
                      ...catchRates(items, entryId),
                  },
              ]
            : [];
    });

const variationRates = (clean: readonly ScoredRun[], entryId: EntryId): readonly VariationRate[] =>
    byCondition(clean).flatMap(([, items]) => {
        const [first] = items;
        const judged = items.filter(isApplicableFor(entryId));
        return first?.condition.kind === 'clean'
            ? [
                  {
                      variation: first.condition.variation,
                      hardNegative: first.condition.hardNegativeFor.includes(entryId),
                      falseAlarms: rateWhere(judged, firedFor(entryId)),
                      notApplicable: items.length - judged.length,
                  },
              ]
            : [];
    });

/**
 * Catch rate over every run of the entry's own faults (`not-applicable` counts as a miss: the detector did not
 * catch it), and again over the runs where the fault took effect; false-alarm rate over the clean runs it judged,
 * with `not-applicable` clean runs reported apart.
 */
export const detectorReport = (runs: readonly ScoredRun[], entryId: EntryId): DetectorReport => {
    const scored = scoredBy(runs, entryId);
    const faulted = ownFaultRuns(scored, entryId);
    const clean = cleanRuns(scored);
    return {
        entryId,
        ...catchRates(faulted, entryId),
        caughtBySeverity: severityRates(faulted, entryId),
        notApplicableOnFaulted: faulted.filter((run) => !isApplicableFor(entryId)(run)).length,
        falseAlarms: rateWhere(clean.filter(isApplicableFor(entryId)), firedFor(entryId)),
        falseAlarmsByVariation: variationRates(clean, entryId),
    };
};
