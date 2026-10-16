import type { CorpusQuestion } from '../../corpus/index.ts';
import type { EntryId } from '../../entries/index.ts';
import { splits, type RunSpec, type ScoredRun } from '../model.ts';
import { planRuns } from '../plan/plan-runs.ts';
import { withPlanSettings } from '../plan/replan.ts';
import type { BedOptions } from './bed-options.ts';

/** The runs `pnpm bed` plans for its split and entry options, with the embedding settings laid over. */
export const plannedSpecs = (options: BedOptions, corpus: readonly CorpusQuestion[]): readonly RunSpec[] =>
    splits
        .filter((split) => options.split === 'all' || options.split === split)
        .flatMap((split) => withPlanSettings(planRuns(corpus, { split, entryId: options.entryId }), options.settings));

/** With `--entry`, every entry still scores the runs; only the requested one is reported. */
export const reportedRuns = (runs: readonly ScoredRun[], entryId: EntryId | null): readonly ScoredRun[] =>
    entryId === null
        ? runs
        : runs.map((run) => ({ ...run, verdicts: run.verdicts.filter((scored) => scored.entryId === entryId) }));
