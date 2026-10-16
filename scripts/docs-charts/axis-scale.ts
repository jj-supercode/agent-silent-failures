import { unitIntervalSchema, type UnitInterval } from '../../src/trace/model.ts';
import { chartLayout } from './chart-layout.ts';

/** Axis ends a reader can halve and fifth in their head; a share axis never goes past 100%. */
const roundAxisEnds = [0.05, 0.1, 0.15, 0.2, 0.25, 0.5, 1] as const;

export const tickCount = 5;

/** The smallest round axis end that holds every interval's upper bound. */
export const roundAxisMax = (uppers: readonly UnitInterval[]): UnitInterval => {
    const highest = Math.max(0, ...uppers);
    return unitIntervalSchema.parse(roundAxisEnds.find((end) => end >= highest) ?? 1);
};

/** `tickCount + 1` evenly spaced ticks from 0 to `axisMax`. */
export const axisTicks = (axisMax: UnitInterval): readonly number[] =>
    Array.from({ length: tickCount + 1 }, (_, index) => (axisMax * index) / tickCount);

/** A tick label: whole percent, since every round axis end splits into whole-percent steps. */
export const tickLabel = (share: number): string => `${Math.round(share * 100)}%`;

export type PlotRange = { readonly left: number; readonly right: number };

/** The horizontal extent of every panel's plot. */
export const plotRange: PlotRange = { left: chartLayout.plotLeft, right: chartLayout.plotRight };

/** Where a share sits on the plot, clamped to the axis. */
export const shareToX = (share: number, axisMax: UnitInterval, range: PlotRange): number =>
    range.left + (Math.min(share, axisMax) / axisMax) * (range.right - range.left);
