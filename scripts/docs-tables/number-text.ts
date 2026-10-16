import { countText, percentText } from '../../src/command-output/index.ts';
import type { FaultCatch, Proportion, Rate } from './model.ts';

/**
 * `30.8% (95% CI 23.3% to 39.6%, n = 120)`: a repro's Wilson estimate. The share is recomputed from the counts,
 * because the stored rate is already rounded to four places.
 */
export const proportionText = (proportion: Proportion): string =>
    `${percentText(proportion.successes / proportion.trials)} ` +
    `(95% CI ${percentText(proportion.low)} to ${percentText(proportion.high)}, n = ${countText(proportion.trials)})`;

/** `36/36, 100.0% (90.4% to 100.0%)`, or `no runs`. Intervals are Wilson 95%. */
export const rateCell = (rate: Rate): string =>
    rate.share === null || rate.interval === null
        ? 'no runs'
        : `${countText(rate.events)}/${countText(rate.trials)}, ${percentText(rate.share)} ` +
          `(${percentText(rate.interval.lower)} to ${percentText(rate.interval.upper)})`;

const disagreementText = (faultCatch: FaultCatch): string =>
    faultCatch.firedWhenNotExpressed === 0
        ? ''
        : `; fired although not expressed: ${countText(faultCatch.firedWhenNotExpressed)}`;

/**
 * `rateCell` of every run; when some runs did not express the fault, also their count, the rate over the rest and
 * any run where the detector fired without an observed effect:
 * `21/24, 87.5% (...); not expressed: 3; caught when expressed 21/21, 100.0% (...)`.
 */
export const catchText = (faultCatch: FaultCatch): string =>
    faultCatch.notExpressed === 0
        ? rateCell(faultCatch.caught)
        : `${rateCell(faultCatch.caught)}; not expressed: ${countText(faultCatch.notExpressed)}; ` +
          `caught when expressed ${rateCell(faultCatch.caughtWhenExpressed)}${disagreementText(faultCatch)}`;
