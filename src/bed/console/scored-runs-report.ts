import { countText, countedText, type CommandReport, type NextStep } from '../../command-output/index.ts';
import { bedExitCodes } from '../cli/bed-exit-codes.ts';
import type { BedReport } from '../model.ts';
import { renderSummary } from '../render/markdown-report.ts';
import type { BedOutcome } from '../runner/run-bed.ts';
import { detectorRateFacts } from './detector-rate-facts.ts';

/** What `pnpm demo` and `pnpm bed` run on, in one line. */
export const offlineStackFact = 'scripted model, local bge-small-en-v1.5 embeddings, in-memory LibSQL; offline, no key';

/** The full headline table and every per-variation rate, as `--details` prints them. */
export const detailLines = (report: BedReport): readonly string[] =>
    report.splits.map(renderSummary).join('\n\n').split('\n');

export type ScoredRunsFacts = {
    readonly plannedRuns: number;
    readonly outcome: BedOutcome;
    readonly report: BedReport;
    readonly outputs: readonly string[];
    readonly next: readonly NextStep[];
};

/** The closing report of a bed run: exit code from its failures, run counts and every detector's exact rates. */
export const scoredRunsReport = ({ plannedRuns, outcome, report, outputs, next }: ScoredRunsFacts): CommandReport => ({
    exit: outcome.failures.length === 0 ? bedExitCodes.allScored : bedExitCodes.runsFailed,
    headline: `${countedText(outcome.runs.length, 'run')} scored, ${countText(outcome.failures.length)} failed`,
    counts: { plannedRuns, scoredRuns: outcome.runs.length, failedRuns: outcome.failures.length },
    rates: detectorRateFacts(report),
    spendUsd: null,
    outputs,
    next,
});
