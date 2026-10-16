import { wilsonInterval } from '../../src/bed/index.ts';
import { roundTo } from './rounding.ts';

export type ProportionEstimate = {
    readonly successes: number;
    readonly trials: number;
    readonly rate: number;
    /** Wilson score 95% interval, computed by the test bed's own `wilsonInterval`. */
    readonly low: number;
    readonly high: number;
};

export const wilsonEstimate = (successes: number, trials: number): ProportionEstimate => {
    if (trials === 0) {
        return { successes, trials, rate: 0, low: 0, high: 1 };
    }
    const { lower, upper } = wilsonInterval(successes, trials);
    return { successes, trials, rate: roundTo(successes / trials, 4), low: roundTo(lower, 4), high: roundTo(upper, 4) };
};

export const formatEstimate = ({ rate, low, high, trials }: ProportionEstimate): string =>
    `${rate} (95% CI ${low} to ${high}, n=${trials})`;
