import { roundTo } from './rounding.ts';

export type Distribution = {
    readonly count: number;
    readonly min: number;
    readonly median: number;
    readonly p90: number;
    readonly max: number;
    readonly mean: number;
};

/** Nearest-rank quantile: for an even count the median is the upper of the two middle values. */
const quantile = (sorted: readonly number[], fraction: number): number =>
    sorted[Math.min(sorted.length - 1, Math.floor(fraction * sorted.length))] ?? Number.NaN;

export const distributionOf = (values: readonly number[]): Distribution => {
    const sorted = values.toSorted((left, right) => left - right);
    const sum = sorted.reduce((total, value) => total + value, 0);
    return {
        count: sorted.length,
        min: sorted[0] ?? Number.NaN,
        median: quantile(sorted, 0.5),
        p90: quantile(sorted, 0.9),
        max: sorted.at(-1) ?? Number.NaN,
        mean: roundTo(sum / sorted.length, 4),
    };
};
