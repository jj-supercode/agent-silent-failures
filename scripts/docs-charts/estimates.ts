import { unitIntervalSchema } from '../../src/trace/model.ts';
import type { Proportion, Rate } from '../docs-tables/index.ts';
import type { Estimate } from './model.ts';

/** A bed rate as an estimate; `null` when it has no trials, so a chart shows a note instead of a dot at 0. */
export const estimateOfRate = (rate: Rate): Estimate | null =>
    rate.share === null || rate.interval === null
        ? null
        : {
              events: rate.events,
              trials: rate.trials,
              share: rate.share,
              lower: rate.interval.lower,
              upper: rate.interval.upper,
          };

/** A repro proportion as an estimate. The share is recomputed from the counts: the stored rate is rounded. */
export const estimateOfProportion = (proportion: Proportion): Estimate => ({
    events: proportion.successes,
    trials: proportion.trials,
    share: unitIntervalSchema.parse(proportion.successes / proportion.trials),
    lower: unitIntervalSchema.parse(proportion.low),
    upper: unitIntervalSchema.parse(proportion.high),
});
