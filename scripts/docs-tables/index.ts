// The public surface of docs-tables: what the chart renderer reads from the same committed results.
export { collectInputs, type DocsInputs } from './collect-inputs.ts';
export type { Proportion, Rate, ReplaySummary, SplitReport } from './model.ts';
export type { EntrySummary } from './render-entries-table.ts';
export type { HeadlineInput } from './render-headline.ts';
export { compareScorings, type ComparisonResult, type ScoringComparison } from './render-scoring-comparison.ts';
export {
    cleanRunCount,
    detectorOf,
    falseAlarmsOf,
    heldOutSplitOf,
    pooledRate,
    revisedOnRecording,
} from './report-queries.ts';
