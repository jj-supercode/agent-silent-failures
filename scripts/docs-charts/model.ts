import type { UnitInterval } from '../../src/trace/model.ts';

/** The charts `pnpm docs:charts` writes; each is rendered once per theme. */
export const chartIds = ['retrieval-past-the-window', 'detector-reliability', 'live-run-lessons'] as const;
export type ChartId = (typeof chartIds)[number];

export const themeNames = ['light', 'dark'] as const;
export type ThemeName = (typeof themeNames)[number];

/** A position in the categorical palette; slots are assigned in fixed order, never cycled. */
export type SeriesSlot = 0 | 1;

/** A binomial share with its Wilson 95% interval, as the result files report it. */
export type Estimate = {
    readonly events: number;
    readonly trials: number;
    readonly share: UnitInterval;
    readonly lower: UnitInterval;
    readonly upper: UnitInterval;
};

export type ChartSeries = { readonly name: string; readonly slot: SeriesSlot };

/**
 * One series in one row: an estimate, or a note saying why there is none (never a silent gap). A mark holds its
 * series itself, so its colour and name can never fail to resolve.
 */
export type ChartMark =
    | { readonly kind: 'estimate'; readonly series: ChartSeries; readonly estimate: Estimate }
    | { readonly kind: 'missing'; readonly series: ChartSeries; readonly note: string };

/** A labelled row; its marks are drawn top to bottom in the order given, which builders keep to the legend's. */
export type ChartRow = { readonly label: string; readonly marks: readonly ChartMark[] };

export type ChartPanel = {
    readonly heading: string;
    /** The right end of the share axis; the left end is always 0. */
    readonly axisMax: UnitInterval;
    /** Print each estimate's value beside it; off where a table next to the chart carries the values. */
    readonly labelValues: boolean;
    readonly rows: readonly ChartRow[];
};

/** A dot-and-interval chart: one message (the title), shares on a common axis per panel, every interval drawn. */
export type ChartSpec = {
    readonly id: ChartId;
    readonly title: string;
    readonly subtitle: string;
    readonly series: readonly ChartSeries[];
    readonly panels: readonly ChartPanel[];
    /** Where every number comes from. */
    readonly footnote: string;
};

export type ChartTheme = {
    readonly surface: string;
    readonly primaryInk: string;
    readonly secondaryInk: string;
    readonly mutedInk: string;
    readonly gridline: string;
    readonly categorical: { readonly [Slot in SeriesSlot]: string };
};
