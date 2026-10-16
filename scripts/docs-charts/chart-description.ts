import { estimateReading } from './estimate-text.ts';
import type { ChartMark, ChartPanel, ChartSpec } from './model.ts';

const markReading = (mark: ChartMark): string => {
    switch (mark.kind) {
        case 'estimate':
            return `${mark.series.name} ${estimateReading(mark.estimate)}`;
        case 'missing':
            return `${mark.series.name}: ${mark.note}`;
        default:
            return mark satisfies never;
    }
};

const panelReading = (panel: ChartPanel): string =>
    [`${panel.heading}.`, ...panel.rows.map((row) => `${row.label}: ${row.marks.map(markReading).join('; ')}.`)].join(
        ' ',
    );

/** The chart as text, every value included: what a screen reader reads, and the chart's table view. */
export const chartDescription = (spec: ChartSpec): string =>
    [spec.subtitle, ...spec.panels.map(panelReading), spec.footnote].join(' ');
