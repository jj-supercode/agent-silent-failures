import { countText, countedText, type CommandHeader, type CommandReport } from '../command-output/index.ts';
import { formatUsd } from './budget/cost.ts';
import type { PreflightDecision } from './budget/preflight.ts';
import { liveExitCodeRegistry } from './exit-codes.ts';
import type { LiveOptions } from './live-options.ts';
import type { SessionOutcome } from './record-session.ts';
import { liveSplit, resumeCommand } from './session-plan.ts';
import { sessionModelIds } from './session-models.ts';
import type { SpendSummary } from './spend-summary.ts';

// What `pnpm demo:live` says about a session: pure text and reports, printed by the entry point.

const modeFact = (options: LiveOptions): string => {
    const { agentModelId } = sessionModelIds(options.mode, options.judge);
    return options.mode === 'dry-run'
        ? `dry run: scripted policies as ${agentModelId}; no key, no network, nothing billed`
        : `live: ${agentModelId}, billed to your key`;
};

/** Budget figures keep the guard's four decimals: rounded to cents, a worst case could read as equal to its cap. */
const budgetFact = (preflight: PreflightDecision): string =>
    `worst case ${formatUsd(preflight.estimate.worstCase)} of a ${formatUsd(preflight.cap)} cap ` +
    `(${preflight.kind === 'within-cap' ? 'within' : 'over'} the cap)`;

export const overBudgetReason = (preflight: PreflightDecision): string =>
    `the worst case ${formatUsd(preflight.estimate.worstCase)} is above the cap ${formatUsd(preflight.cap)}`;

export const sessionHeader = (
    options: LiveOptions,
    plannedRuns: number,
    preflight: PreflightDecision,
): CommandHeader => ({
    title: 'agent-silent-failures demo:live',
    description: `Records ${countedText(plannedRuns, `${liveSplit} agent run`)} and their traces as replayable fixtures.`,
    measures: null,
    total: plannedRuns,
    unit: 'runs',
    facts: [
        ['mode', modeFact(options)],
        ['budget', budgetFact(preflight)],
    ],
});

/** The pre-flight's numbers, in every report made after it: what a JSON consumer needs to judge a refusal. */
export const budgetCounts = (preflight: PreflightDecision): Readonly<Record<string, number>> => ({
    capUsd: preflight.cap,
    preflightWorstCaseUsd: preflight.estimate.worstCase,
});

export type RecordedSessionFacts = {
    readonly options: LiveOptions;
    readonly plannedRuns: number;
    readonly preflight: PreflightDecision;
    readonly outcome: SessionOutcome;
    readonly spend: SpendSummary;
    /** As printed: repo-relative inside the repository. */
    readonly directory: string;
    /** As given to `--resume`. */
    readonly fixtureDirectory: string;
};

/** The closing report of a session that recorded: counts, spend, where it wrote and what to run next. */
export const recordedSessionReport = (facts: RecordedSessionFacts): CommandReport => {
    const { outcome, spend, directory } = facts;
    const stopped = outcome.stoppedEarly !== null;
    const resume = resumeCommand(facts.options, facts.fixtureDirectory);
    return {
        exit: stopped ? liveExitCodeRegistry.stoppedEarly : liveExitCodeRegistry.done,
        headline: `recorded ${countedText(outcome.recordedRuns, 'run')} (${countText(outcome.failedRuns)} failed) to ${directory}`,
        counts: {
            plannedRuns: facts.plannedRuns,
            recordedRuns: outcome.recordedRuns,
            failedRuns: outcome.failedRuns,
            retriedRuns: outcome.retriedRuns.length,
            modelCalls: spend.modelCalls,
            inputTokens: spend.inputTokens,
            outputTokens: spend.outputTokens,
            ...budgetCounts(facts.preflight),
            ...(spend.estimated ? { estimatedSpendUsd: spend.spentUsd } : {}),
        },
        rates: [],
        // A dry run bills nothing (`null`, as for any command that spends nothing); its estimate is a count.
        spendUsd: spend.estimated ? null : spend.spentUsd,
        outputs: [`${directory}/`],
        next: [
            ...(stopped ? [{ command: resume, purpose: 'record the rest' }] : []),
            { command: `pnpm replay --fixtures ${directory}`, purpose: 'score the recording offline' },
        ],
    };
};
