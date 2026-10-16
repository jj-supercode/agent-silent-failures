import { percentText } from '../../command-output/index.ts';
import type { FaultCatch, Rate } from '../model.ts';

/** `caught 58/60 = 96.7% [Wilson 95%: 88.6%, 99.1%]`; with no events the rule-of-three bound is added. */
export const rateLine = (label: string, rate: Rate): string => {
    if (rate.share === null || rate.interval === null) {
        return `${label} 0/0 (no runs)`;
    }
    const { lower, upper, ruleOfThreeUpper } = rate.interval;
    const ruleOfThree = ruleOfThreeUpper === null ? '' : `; rule of three: ${percentText(ruleOfThreeUpper)}`;
    return (
        `${label} ${rate.events}/${rate.trials} = ${percentText(rate.share)} ` +
        `[Wilson 95%: ${percentText(lower)}, ${percentText(upper)}${ruleOfThree}]`
    );
};

/** A compact table cell: `24/24` or `-` when the condition had no runs in the detector's scope. */
export const countCell = (rate: Rate): string => (rate.trials === 0 ? '-' : `${rate.events}/${rate.trials}`);

/** A compact percentage cell: `96.7%` or `-`. */
export const shareCell = (rate: Rate): string => (rate.share === null ? '-' : percentText(rate.share));

const disagreementText = (rates: FaultCatch): string =>
    rates.firedWhenNotExpressed === 0 ? '' : `; fired although not expressed: ${rates.firedWhenNotExpressed}`;

/**
 * The catch line, plus the rate over runs where the fault took effect when some did not, and any run where the
 * detector fired without an observed effect:
 * `caught 21/24 = ... ; not expressed: 3; caught when expressed 21/21 = ...`.
 */
export const catchLine = (rates: FaultCatch): string =>
    rates.notExpressed === 0
        ? rateLine('caught', rates.caught)
        : `${rateLine('caught', rates.caught)}; not expressed: ${rates.notExpressed}; ` +
          rateLine('caught when expressed', rates.caughtWhenExpressed) +
          disagreementText(rates);
