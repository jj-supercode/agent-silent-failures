import { countText } from '../../src/command-output/index.ts';
import type { EntryId } from '../../src/entries/index.ts';
import {
    type ComparisonResult,
    falseAlarmsOf,
    pooledRate,
    type Rate,
    type ScoringComparison,
} from '../docs-tables/index.ts';
import { roundAxisMax } from './axis-scale.ts';
import { estimateOfRate } from './estimates.ts';
import type { ChartMark, ChartRow, ChartSeries, ChartSpec } from './model.ts';

export type LessonsChartInput = { readonly comparison: ComparisonResult; readonly fixture: string };

const firstScoring = { name: 'First scoring', slot: 1 } as const satisfies ChartSeries;
const now = { name: 'Now, after the rule changes', slot: 0 } as const satisfies ChartSeries;

const markOf = (series: ChartSeries, rate: Rate): ChartMark => {
    const estimate = estimateOfRate(rate);
    return estimate === null
        ? { kind: 'missing', series, note: 'no judged runs' }
        : { kind: 'estimate', series, estimate };
};

/** The entries whose recorded false alarms changed between the two scorings. */
const changedEntries = ({ first, current }: ScoringComparison): readonly EntryId[] =>
    current.detectors
        .filter((detector) => falseAlarmsOf(first, detector.entryId).events !== detector.falseAlarms.events)
        .map((detector) => detector.entryId);

const rowsOf = (comparison: ScoringComparison): readonly ChartRow[] =>
    changedEntries(comparison).map((entryId) => ({
        label: entryId,
        marks: [
            markOf(firstScoring, falseAlarmsOf(comparison.first, entryId)),
            markOf(now, falseAlarmsOf(comparison.current, entryId)),
        ],
    }));

const totalFalseAlarms = (comparison: ScoringComparison, side: 'first' | 'current'): number =>
    pooledRate(comparison[side].detectors.map((detector) => detector.falseAlarms)).events;

const sources = 'results/replay/first-scoring/report.json and results/replay/report.json';

/** A chart with nothing to plot, saying why. */
const messageChart = (title: string, subtitle: string): ChartSpec => ({
    id: 'live-run-lessons',
    title,
    subtitle,
    series: [],
    panels: [],
    footnote: `Sources: ${sources}.`,
});

const comparedChart = (comparison: ScoringComparison, fixture: string): ChartSpec => {
    const rows = rowsOf(comparison);
    if (rows.length === 0) {
        return messageChart(
            'No recorded false alarm changed since the first scoring',
            `Both scorings of ${fixture} give every entry the same false alarms, so there is no before and after.`,
        );
    }
    return {
        id: 'live-run-lessons',
        title:
            `Recorded false alarms: ${countText(totalFalseAlarms(comparison, 'first'))} at first scoring, ` +
            `${countText(totalFalseAlarms(comparison, 'current'))} after the rule changes (in-sample)`,
        subtitle:
            'Every false alarm of the first scoring was read in its trace and became a rule about agent behaviour; ' +
            'no threshold value was tuned. Both scorings are of the same recording, so "now" shows the fixes work ' +
            'on the traces that revealed the problems, not how they generalise.',
        series: [firstScoring, now],
        panels: [
            {
                heading: 'False alarms on recorded clean runs, per changed entry',
                axisMax: roundAxisMax(
                    rows.flatMap((row) =>
                        row.marks.flatMap((mark) => (mark.kind === 'estimate' ? [mark.estimate.upper] : [])),
                    ),
                ),
                labelValues: true,
                rows,
            },
        ],
        footnote: `Recording: ${fixture}. Sources: ${sources}, both scored offline by pnpm replay. Wilson 95% intervals.`,
    };
};

/** What the live run taught: the recorded false alarms of each changed entry, first scoring against now. */
export const lessonsChart = ({ comparison, fixture }: LessonsChartInput): ChartSpec =>
    comparison.kind === 'comparable'
        ? comparedChart(comparison.comparison, fixture)
        : messageChart('No before and after to show', comparison.reason);
