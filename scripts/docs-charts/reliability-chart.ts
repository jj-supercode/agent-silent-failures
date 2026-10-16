import { countText } from '../../src/command-output/index.ts';
import { unitIntervalSchema } from '../../src/trace/model.ts';
import {
    cleanRunCount,
    detectorOf,
    type EntrySummary,
    pooledRate,
    type Rate,
    type ReplaySummary,
    type SplitReport,
} from '../docs-tables/index.ts';
import { roundAxisMax } from './axis-scale.ts';
import { estimateOfRate } from './estimates.ts';
import type { ChartMark, ChartPanel, ChartSeries, ChartSpec } from './model.ts';

/** A recorded set: the replay of traces from a real model, with its held-out split. */
export type RecordedScoring = {
    readonly summary: ReplaySummary;
    readonly heldOut: SplitReport;
    /** The recording's rules were revised on its own traces, so its false alarms are in-sample. */
    readonly inSample: boolean;
};

export type ReliabilityChartInput = {
    readonly entries: readonly EntrySummary[];
    readonly scripted: SplitReport;
    readonly recorded: RecordedScoring | null;
};

/** The chart's input before the scripted held-out split is known to exist. */
export type ReliabilityChartSources = Omit<ReliabilityChartInput, 'scripted'> & {
    readonly scripted: SplitReport | undefined;
};

const scriptedSeries = { name: 'Scripted bed, held-out split', slot: 0 } as const satisfies ChartSeries;

const recordedSeries = (recorded: RecordedScoring): ChartSeries => ({
    name: `Recorded from ${recorded.summary.manifest.models.agent}`,
    slot: 1,
});

const markOf = (series: ChartSeries, rate: Rate | undefined, note: string): ChartMark => {
    const estimate = rate === undefined ? null : estimateOfRate(rate);
    return estimate === null ? { kind: 'missing', series, note } : { kind: 'estimate', series, estimate };
};

type Measure = 'caught' | 'falseAlarms';

const recordedNote = (entry: EntrySummary, measure: Measure): string => {
    if (entry.kind === 'ingestion') {
        return 'not recordable: ingestion calls no model';
    }
    return measure === 'caught' ? 'no recorded fault runs' : 'not scored on the recording';
};

const entryMarks = (input: ReliabilityChartInput, entry: EntrySummary, measure: Measure): readonly ChartMark[] => [
    markOf(scriptedSeries, detectorOf(input.scripted, entry.id)?.[measure], 'not scored'),
    ...(input.recorded === null
        ? []
        : [
              markOf(
                  recordedSeries(input.recorded),
                  detectorOf(input.recorded.heldOut, entry.id)?.[measure],
                  recordedNote(entry, measure),
              ),
          ]),
];

const ratesOf = (input: ReliabilityChartInput, measure: Measure): readonly Rate[] =>
    [input.scripted, ...(input.recorded === null ? [] : [input.recorded.heldOut])].flatMap((split) =>
        input.entries.flatMap((entry) => detectorOf(split, entry.id)?.[measure] ?? []),
    );

const panelOf = (input: ReliabilityChartInput, measure: Measure, heading: string): ChartPanel => ({
    heading,
    axisMax:
        measure === 'caught'
            ? unitIntervalSchema.parse(1)
            : roundAxisMax(ratesOf(input, measure).flatMap((rate) => rate.interval?.upper ?? [])),
    labelValues: false,
    rows: input.entries.map((entry) => ({
        label: entry.id,
        marks: entryMarks(input, entry, measure),
    })),
});

const falseAlarmTotal = (input: ReliabilityChartInput): Rate => pooledRate(ratesOf(input, 'falseAlarms'));

const titleOf = (input: ReliabilityChartInput): string =>
    falseAlarmTotal(input).events === 0
        ? `None of the ${input.entries.length} detectors fired on a clean run, scripted or recorded`
        : 'Detector catch rates on faulted runs and false alarms on clean runs';

const subtitleOf = (input: ReliabilityChartInput): string =>
    `Held-out scripted bed: ${countText(input.scripted.agentRuns)} agent runs and ${countText(input.scripted.ingestions)} ` +
    'ingestions, faulted and clean' +
    (input.recorded === null
        ? '. '
        : `; recorded: ${countText(cleanRunCount(input.recorded.heldOut))} clean runs and the infrastructure faults a ` +
          'real model can meet. ') +
    'Each dot is a share with its Wilson 95% interval. The false-alarm axis is zoomed in.';

const footnoteOf = (input: ReliabilityChartInput): string =>
    'Sources: results/offline/report.json (scripted)' +
    (input.recorded === null
        ? '.'
        : ` and results/replay/report.json (${input.recorded.summary.fixture}, scored offline by pnpm replay).` +
          (input.recorded.inSample
              ? ' The recorded false alarms are in-sample: detector rules were revised after reading this recording.'
              : '')) +
    ' Caught counts every faulted run, including runs where the fault changed nothing observable; the catalog ' +
    'table also gives the rate over the runs that expressed it. A behaviour fault replaces the model, so it has no ' +
    'recorded runs.';

const measuredChart = (input: ReliabilityChartInput): ChartSpec => ({
    id: 'detector-reliability',
    title: titleOf(input),
    subtitle: subtitleOf(input),
    series: input.recorded === null ? [scriptedSeries] : [scriptedSeries, recordedSeries(input.recorded)],
    panels: [
        panelOf(input, 'caught', 'Caught on faulted runs'),
        panelOf(
            input,
            'falseAlarms',
            input.recorded?.inSample === true
                ? 'False alarms on clean runs (lower is better; recorded values in-sample)'
                : 'False alarms on clean runs (lower is better)',
        ),
    ],
    footnote: footnoteOf(input),
});

/** Detector reliability: catch rates on faulted runs and false alarms on clean runs, scripted beside recorded. */
export const reliabilityChart = ({ scripted, ...rest }: ReliabilityChartSources): ChartSpec =>
    scripted === undefined
        ? {
              id: 'detector-reliability',
              title: 'No scripted results to show',
              subtitle: 'The offline report has no held-out split; run pnpm bed --split all --write-results.',
              series: [],
              panels: [],
              footnote: 'Source: results/offline/report.json.',
          }
        : measuredChart({ ...rest, scripted });
