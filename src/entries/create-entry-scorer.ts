import { createScorer, notScorable, type NotScorable } from '@mastra/core/evals';

import {
    loadIngestionView,
    loadRunViews,
    traceIdSchema,
    TraceUnavailableError,
    type RunView,
    type TraceId,
    type TraceSource,
    type ViewLoadResult,
} from '../trace/index.ts';
import type { Entry, RunEntry, ThresholdOverrides, Thresholds, Verdict } from './contract.ts';
import { ScorerWithoutMastraError } from './errors.ts';
import { verdictReason, type ScoredVerdict } from './verdict-reason.ts';
import { worstVerdict } from './worst-verdict.ts';

export type EntryScorerOptions<TThresholds extends Thresholds> = {
    /** New values for some of the entry's thresholds; names are checked against the entry's own. */
    readonly thresholds: ThresholdOverrides<TThresholds>;
};

/** Turns a view load into what the scorer pipeline expects; an unreadable trace throws instead of passing as clear. */
const judge = <TView>(loaded: ViewLoadResult<TView>, detect: (view: TView) => Verdict): ScoredVerdict | NotScorable => {
    switch (loaded.kind) {
        case 'trace-unavailable':
            throw new TraceUnavailableError(loaded.failure);
        case 'wrong-shape':
            return notScorable(loaded.reason);
        case 'loaded': {
            const verdict = detect(loaded.view);
            return verdict.kind === 'not-applicable' ? notScorable(verdict.reason) : verdict;
        }
        default:
            return loaded satisfies never;
    }
};

/** Judges each top-level agent run on its own; see `worstVerdict` for how their verdicts combine. */
const detectEveryAgent =
    <TThresholds extends Thresholds>(entry: RunEntry<TThresholds>, overrides: ThresholdOverrides<TThresholds>) =>
    ([first, ...rest]: readonly [RunView, ...RunView[]]): Verdict =>
        worstVerdict([entry.detect(first, overrides), ...rest.map((view) => entry.detect(view, overrides))]);

const judgeTrace = async <TThresholds extends Thresholds>(
    entry: Entry<TThresholds>,
    overrides: ThresholdOverrides<TThresholds>,
    source: TraceSource,
    traceId: TraceId,
): Promise<ScoredVerdict | NotScorable> =>
    entry.kind === 'run'
        ? judge(await loadRunViews(source, traceId, entry.runViewOptions), detectEveryAgent(entry, overrides))
        : judge(await loadIngestionView(source, traceId), (view) => entry.detect(view, overrides));

/**
 * The Mastra adapter for one entry: a code-only scorer (no judge, no `type` shortcut) for trace scoring. It loads
 * the whole stored trace itself, because trace scoring hands a scorer only the target span's input and output.
 * Score 1 means the failure fired, 0 means clear; a fired reason starts with the verdict's severity. An unreadable
 * trace throws, so it never passes as clear. A run entry judges every agent the trace ran at top level, so an agent
 * run as a workflow step is scored too (see `worstVerdict`). `options.thresholds` overrides some thresholds.
 */
export const createEntryScorer = <TThresholds extends Thresholds>(
    entry: Entry<TThresholds>,
    options: EntryScorerOptions<TThresholds> = { thresholds: {} },
) =>
    createScorer({ id: entry.id, name: entry.title, description: entry.summary })
        .preprocess(async ({ run, mastra }) => {
            const traceId = traceIdSchema.safeParse(run.targetTraceId);
            if (!traceId.success) {
                return notScorable('no target trace: this scorer reads stored traces (trace scoring only)');
            }
            if (mastra === undefined) {
                throw new ScorerWithoutMastraError(entry.id);
            }
            return judgeTrace(entry, options.thresholds, mastra, traceId.data);
        })
        .generateScore(({ results }) => (results.preprocessStepResult.kind === 'fired' ? 1 : 0))
        .generateReason(({ results }) => verdictReason(results.preprocessStepResult));
