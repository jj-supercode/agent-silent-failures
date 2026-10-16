import type { HarnessKind } from '../catalog/index.ts';
import { billedTokenCountSchema, usdSchema, type CallLimits, type Usd } from './budget/model.ts';

/**
 * Per-call limits for the agent model. Prompts stay far below the price tier boundary (100,000 tokens). The largest
 * recorded prompt (Mastra's 4,000-character chunks at top K 8, searched twice) is about 57,000 characters, an
 * estimated 19,500 tokens; 40,000 leaves room for a real model that searches more often. The output limit bounds
 * thinking plus answer per step. The per-run caps, not these, bound the session's money.
 */
export const agentCallLimits: CallLimits = {
    maxPromptTokens: billedTokenCountSchema.parse(40_000),
    maxOutputTokens: billedTokenCountSchema.parse(1_500),
};

/** The judge reads one question, one gold answer and one agent answer, and returns a verdict and one sentence. */
export const judgeCallLimits: CallLimits = {
    maxPromptTokens: billedTokenCountSchema.parse(2_000),
    maxOutputTokens: billedTokenCountSchema.parse(400),
};

export type RunLimits = {
    readonly maxModelCalls: number;
    readonly maxUsd: Usd;
};

/**
 * What one run may use. The agent's step budget is 10 per agent run; the call limit adds room for provider retries.
 * A supervisor run includes its workers' calls. The spend caps sit about 10 times above a typical run's cost
 * (estimated USD 0.0015 single agent, USD 0.0056 supervisor), so only a runaway run ever meets them.
 */
export const runLimits = {
    'single-agent': { maxModelCalls: 12, maxUsd: usdSchema.parse(0.015) },
    'multi-agent': { maxModelCalls: 36, maxUsd: usdSchema.parse(0.05) },
} as const satisfies Record<HarnessKind, RunLimits>;

export const judgeRunLimits: RunLimits = { maxModelCalls: 2, maxUsd: usdSchema.parse(0.009) };
