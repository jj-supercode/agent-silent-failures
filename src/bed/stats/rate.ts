import { unitIntervalSchema, type UnitInterval } from '../../trace/index.ts';
import type { Rate } from '../model.ts';

/** The 97.5% standard normal quantile: a two-sided 95% interval. */
const z95 = 1.959963984540054;

/** Bounds closer than this to 0 or 1 are float noise of the formula (a lower bound of 6.9e-18 at zero events). */
const boundNoise = 1e-12;

const withoutNoise = (value: number): number =>
    Math.abs(value) < boundNoise ? 0 : Math.abs(1 - value) < boundNoise ? 1 : value;

/** Rounding can leave a bound a hair outside [0, 1] or a hair off 0 and 1. */
const toUnitInterval = (value: number): UnitInterval =>
    unitIntervalSchema.parse(withoutNoise(Math.min(1, Math.max(0, value))));

/**
 * Wilson score interval (Wilson 1927, JASA 22(158)); Brown, Cai and DasGupta (2001) recommend it over the Wald
 * interval for small samples and shares near 0 or 1.
 */
export const wilsonInterval = (events: number, trials: number): { lower: UnitInterval; upper: UnitInterval } => {
    const share = events / trials;
    const zSquaredOverTrials = (z95 * z95) / trials;
    const denominator = 1 + zSquaredOverTrials;
    const centre = (share + zSquaredOverTrials / 2) / denominator;
    const halfWidth =
        (z95 * Math.sqrt((share * (1 - share)) / trials + zSquaredOverTrials / (4 * trials))) / denominator;
    return { lower: toUnitInterval(centre - halfWidth), upper: toUnitInterval(centre + halfWidth) };
};

/**
 * With no events in `trials`, the 95% upper bound is about 3 / trials (Hanley and Lippman-Hand, JAMA 1983). The
 * approximation holds from about 30 trials; below that the bound is not reported, the Wilson bound still is.
 */
export const ruleOfThreeMinTrials = 30;

export const ruleOfThreeUpper = (trials: number): UnitInterval | null =>
    trials < ruleOfThreeMinTrials ? null : toUnitInterval(3 / trials);

export const rateOf = (events: number, trials: number): Rate =>
    trials === 0
        ? { events, trials, share: null, interval: null }
        : {
              events,
              trials,
              share: toUnitInterval(events / trials),
              interval: {
                  ...wilsonInterval(events, trials),
                  ruleOfThreeUpper: events === 0 ? ruleOfThreeUpper(trials) : null,
              },
          };

/** Counts the items that satisfy `isEvent` among `items`. */
export const rateWhere = <T>(items: readonly T[], isEvent: (item: T) => boolean): Rate =>
    rateOf(items.filter(isEvent).length, items.length);
