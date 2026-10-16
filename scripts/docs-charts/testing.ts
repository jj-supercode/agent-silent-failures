import { unitIntervalSchema } from '../../src/trace/model.ts';
import type { ChartSeries, ChartSpec, Estimate } from './model.ts';

/** A sample estimate for the chart tests: `events` of `trials`, with the interval given. */
export const sampleEstimate = (events: number, trials: number, lower: number, upper: number): Estimate => ({
    events,
    trials,
    share: unitIntervalSchema.parse(events / trials),
    lower: unitIntervalSchema.parse(lower),
    upper: unitIntervalSchema.parse(upper),
});

const firstScoring = { name: 'First scoring', slot: 1 } as const satisfies ChartSeries;
const now = { name: 'Now', slot: 0 } as const satisfies ChartSeries;

export const sampleChartSpec: ChartSpec = {
    id: 'live-run-lessons',
    title: 'Before & after',
    subtitle: 'Two scorings of one recording.',
    series: [firstScoring, now],
    panels: [
        {
            heading: 'False alarms',
            axisMax: unitIntervalSchema.parse(0.15),
            labelValues: true,
            rows: [
                {
                    label: 'tool-loop',
                    marks: [
                        { kind: 'estimate', series: firstScoring, estimate: sampleEstimate(9, 312, 0.015, 0.054) },
                        { kind: 'estimate', series: now, estimate: sampleEstimate(0, 312, 0, 0.012) },
                    ],
                },
                {
                    label: 'embedding-coverage',
                    marks: [{ kind: 'missing', series: firstScoring, note: 'not recordable' }],
                },
            ],
        },
    ],
    footnote: 'Source: results/replay/report.json.',
};
