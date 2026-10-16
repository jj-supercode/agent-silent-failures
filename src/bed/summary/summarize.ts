import { splits, type BedReport, type ScoredRun, type Split, type SplitReport } from '../model.ts';
import { confusionMatrix } from './confusion-matrix.ts';
import { detectorReport } from './detector-report.ts';
import { headlineRows } from './headline.ts';
import { entryIdsOf } from './run-queries.ts';
import { thresholdSensitivity } from './threshold-sensitivity.ts';

const splitReport = (split: Split, runs: readonly ScoredRun[]): SplitReport => {
    const entryIds = entryIdsOf(runs);
    return {
        split,
        agentRuns: runs.filter((run) => run.observation.kind === 'agent-run').length,
        ingestions: runs.filter((run) => run.observation.kind === 'ingestion').length,
        detectors: entryIds.map((entryId) => detectorReport(runs, entryId)),
        confusion: confusionMatrix(runs, entryIds),
        sensitivity: entryIds.flatMap((entryId) => thresholdSensitivity(runs, entryId)),
        headline: headlineRows(runs, entryIds),
    };
};

/**
 * Aggregates scored runs into rates with Wilson intervals, per split; dev and held-out are never pooled. Pure, so
 * the scripted bed and replay of recorded traces report through the same code.
 */
export const summarize = (runs: readonly ScoredRun[]): BedReport => ({
    sources: [...new Set(runs.map((run) => run.source))],
    splits: splits.flatMap((split) => {
        const inSplit = runs.filter((run) => run.split === split);
        return inSplit.length === 0 ? [] : [splitReport(split, inSplit)];
    }),
});
