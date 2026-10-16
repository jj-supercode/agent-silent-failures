import { catalogEntries } from '../../src/catalog/index.ts';
import { compareScorings, type DocsInputs, heldOutSplitOf, revisedOnRecording } from '../docs-tables/index.ts';
import { lessonsChart } from './lessons-chart.ts';
import { chartIds, themeNames, type ChartId, type ChartSpec, type ThemeName } from './model.ts';
import { reliabilityChart, type RecordedScoring } from './reliability-chart.ts';
import { renderChart } from './render-chart.ts';
import { retrievalChart } from './retrieval-chart.ts';
import { chartThemes } from './themes.ts';

/** Where a chart is written, relative to the repository root: one file per theme. */
export const chartPath = (id: ChartId, theme: ThemeName): string => `docs/images/charts/${id}-${theme}.svg`;

export type ChartFile = { readonly path: string; readonly content: string };

/** A recorded set, when the committed replay is of one; in-sample when its first scoring found other false alarms. */
const recordedScoring = (inputs: DocsInputs): RecordedScoring | null => {
    const heldOut = heldOutSplitOf(inputs.replayReport);
    return inputs.replaySummary.source !== 'recorded' || heldOut === undefined
        ? null
        : {
              summary: inputs.replaySummary,
              heldOut,
              inSample: revisedOnRecording(
                  { summary: inputs.firstScoringSummary, report: inputs.firstScoringReport },
                  { summary: inputs.replaySummary, report: inputs.replayReport },
              ),
          };
};

const chartSpecs = (inputs: DocsInputs): { readonly [Id in ChartId]: ChartSpec } => ({
    'retrieval-past-the-window': retrievalChart(inputs.headlineRepros),
    'detector-reliability': reliabilityChart({
        entries: catalogEntries,
        scripted: heldOutSplitOf(inputs.offline),
        recorded: recordedScoring(inputs),
    }),
    'live-run-lessons': lessonsChart({
        comparison: compareScorings(
            {
                summary: inputs.firstScoringSummary,
                report: inputs.firstScoringReport,
                offline: inputs.firstScoringOffline,
            },
            { summary: inputs.replaySummary, report: inputs.replayReport, offline: inputs.offline },
        ),
        fixture: inputs.replaySummary.fixture,
    }),
});

/** Every chart file, in both themes, rendered from the committed results. */
export const chartFiles = (inputs: DocsInputs): readonly ChartFile[] => {
    const specs = chartSpecs(inputs);
    return chartIds.flatMap((id) =>
        themeNames.map((theme) => ({
            path: chartPath(id, theme),
            content: renderChart(specs[id], chartThemes[theme]),
        })),
    );
};
