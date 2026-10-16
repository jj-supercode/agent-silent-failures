import { z } from 'zod';

import { formatUsd } from './budget/cost.ts';
import {
    billedTokenCountSchema,
    usdSchema,
    type BilledTokenCount,
    type CallLimits,
    type ModelPrice,
    type SpendState,
    type Usd,
} from './budget/model.ts';
import { agentModelPrice, judgeModelPrice, pricesReadOn, pricingSourceUrl } from './budget/pricing.ts';
import type { LiveMode, LiveOptions } from './live-options.ts';
import { retriedRunSchema, type RetriedRun } from './resilience/model.ts';
import { agentCallLimits, judgeCallLimits, judgeRunLimits, runLimits, type RunLimits } from './run-limits.ts';

/** `spend.json` next to the fixtures: what the recording cost, over all its sessions, and under which limits. */
export type SpendSummary = {
    readonly mode: LiveMode;
    /** A dry run bills nothing: its token counts are the guard's own estimates, priced as a live run would be. */
    readonly estimated: boolean;
    readonly capUsd: Usd;
    readonly preflightWorstCaseUsd: Usd;
    readonly spentUsd: Usd;
    readonly modelCalls: number;
    readonly inputTokens: BilledTokenCount;
    readonly outputTokens: BilledTokenCount;
    readonly pricing: {
        readonly source: string;
        readonly readOn: string;
        readonly agent: ModelPrice;
        readonly judge: ModelPrice | null;
    };
    readonly limits: {
        readonly agentCall: CallLimits;
        readonly judgeCall: CallLimits | null;
        readonly perRun: Readonly<Record<string, RunLimits>>;
    };
    readonly stoppedEarly: string | null;
    /** Every run that took more than one attempt or met a transient failure; each attempt is in the spend above. */
    readonly retriedRuns: readonly RetriedRun[];
};

export type SpendSummaryInput = {
    readonly mode: LiveMode;
    readonly cap: Usd;
    readonly preflightWorstCase: Usd;
    readonly spend: SpendState;
    readonly agentPrice: ModelPrice;
    readonly judgePrice: ModelPrice | null;
    readonly limits: SpendSummary['limits'];
    readonly stoppedEarly: string | null;
    readonly retriedRuns: readonly RetriedRun[];
};

/** What a summary reports beside the spend itself: the session's mode, cap, prices and limits. */
export type SpendContext = Omit<SpendSummaryInput, 'spend' | 'stoppedEarly' | 'retriedRuns'>;

/** Prices and limits the spend summary reports next to the session's numbers. */
export const spendContextOf = (options: LiveOptions, preflightWorstCase: Usd): SpendContext => ({
    mode: options.mode,
    cap: options.maxUsd,
    preflightWorstCase,
    agentPrice: agentModelPrice,
    judgePrice: options.judge ? judgeModelPrice : null,
    limits: {
        agentCall: agentCallLimits,
        judgeCall: options.judge ? judgeCallLimits : null,
        perRun: { ...runLimits, judge: judgeRunLimits },
    },
});

export const toSpendSummary = (input: SpendSummaryInput): SpendSummary => ({
    mode: input.mode,
    estimated: input.mode === 'dry-run',
    capUsd: input.cap,
    preflightWorstCaseUsd: input.preflightWorstCase,
    spentUsd: input.spend.spent,
    modelCalls: input.spend.callCount,
    inputTokens: input.spend.inputTokens,
    outputTokens: input.spend.outputTokens,
    pricing: { source: pricingSourceUrl, readOn: pricesReadOn, agent: input.agentPrice, judge: input.judgePrice },
    limits: input.limits,
    stoppedEarly: input.stoppedEarly,
    retriedRuns: input.retriedRuns,
});

/**
 * What a resumed session reads back from `spend.json`: the spend so far, which the new session's cap also covers,
 * and the retried runs. Summaries written before retries existed carry no `retriedRuns`; none happened then.
 */
export const recordedSpendSchema = z.object({
    mode: z.enum(['dry-run', 'live']),
    spentUsd: usdSchema,
    modelCalls: z.int().nonnegative(),
    inputTokens: billedTokenCountSchema,
    outputTokens: billedTokenCountSchema,
    retriedRuns: z.array(retriedRunSchema).readonly().default([]),
});
export type RecordedSpend = z.infer<typeof recordedSpendSchema>;

export const spendStateOf = (recorded: RecordedSpend): SpendState => ({
    spent: recorded.spentUsd,
    callCount: recorded.modelCalls,
    inputTokens: recorded.inputTokens,
    outputTokens: recorded.outputTokens,
});

/**
 * The closing spend line. A resumed recording's summary covers every session, so the line names this session's share
 * too; `priorSpend` is what earlier sessions had spent.
 */
export const formatSpend = (summary: SpendSummary, priorSpend: SpendState): string =>
    `${summary.estimated ? 'Estimated spend (dry run, nothing billed)' : 'Spend'}` +
    `${priorSpend.callCount > 0 ? ' for the whole recording' : ''}: ${formatUsd(summary.spentUsd)} ` +
    `over ${summary.modelCalls} model calls (${summary.inputTokens} in, ${summary.outputTokens} out tokens)` +
    (priorSpend.callCount > 0
        ? `, of which this session ${formatUsd(usdSchema.parse(Math.max(0, summary.spentUsd - priorSpend.spent)))} ` +
          `over ${summary.modelCalls - priorSpend.callCount} calls`
        : '') +
    `; cap ${formatUsd(summary.capUsd)}, pre-flight worst case ${formatUsd(summary.preflightWorstCaseUsd)}`;
