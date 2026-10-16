import type { RateFact } from '../../command-output/index.ts';
import type { BedReport, DetectorReport, Rate, Split } from '../model.ts';

const rateFact = (split: Split, detector: DetectorReport, measure: string, rate: Rate): RateFact => ({
    group: split,
    subject: detector.entryId,
    measure,
    events: rate.events,
    trials: rate.trials,
    share: rate.share,
    interval: rate.interval === null ? null : { lower: rate.interval.lower, upper: rate.interval.upper },
});

/**
 * Every detector's exact rates per split, for `--json`: `caught`, `caught-when-expressed` (only where some fault runs
 * changed nothing observable) and `false-alarms`.
 */
export const detectorRateFacts = (report: BedReport): readonly RateFact[] =>
    report.splits.flatMap((split) =>
        split.detectors.flatMap((detector) => [
            rateFact(split.split, detector, 'caught', detector.caught),
            ...(detector.notExpressed === 0
                ? []
                : [rateFact(split.split, detector, 'caught-when-expressed', detector.caughtWhenExpressed)]),
            rateFact(split.split, detector, 'false-alarms', detector.falseAlarms),
        ]),
    );
