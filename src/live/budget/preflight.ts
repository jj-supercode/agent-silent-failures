import { countedText } from '../../command-output/index.ts';
import { formatUsd, sumUsd } from './cost.ts';
import { usdSchema, type Usd } from './model.ts';

/** A group of runs, each held by the guard to its own spend cap. */
export type PlannedRuns = {
    readonly label: string;
    readonly runs: number;
    readonly maxUsdPerRun: Usd;
};

export type PreflightLine = PlannedRuns & { readonly worstCase: Usd };

export type PreflightEstimate = {
    readonly lines: readonly PreflightLine[];
    /** Spent by earlier sessions of the same recording (a resumed session); the cap covers it too. */
    readonly alreadySpent: Usd;
    readonly worstCase: Usd;
};

export type PreflightDecision = {
    readonly kind: 'within-cap' | 'over-cap';
    readonly estimate: PreflightEstimate;
    readonly cap: Usd;
};

/**
 * The guard refuses any call that could take a run's attempt past its cap, so this bounds a session's first attempts,
 * not a forecast. Retries are paid from the same session cap, which the guard never lets spend cross.
 */
export const estimateWorstCase = (
    planned: readonly PlannedRuns[],
    alreadySpent: Usd = usdSchema.parse(0),
): PreflightEstimate => {
    const lines = planned.map((group) => ({ ...group, worstCase: usdSchema.parse(group.runs * group.maxUsdPerRun) }));
    return { lines, alreadySpent, worstCase: sumUsd([alreadySpent, ...lines.map((line) => line.worstCase)]) };
};

/** A session starts only when every planned run could spend its whole cap and the total still fits. */
export const decidePreflight = (
    planned: readonly PlannedRuns[],
    cap: Usd,
    alreadySpent: Usd = usdSchema.parse(0),
): PreflightDecision => {
    const estimate = estimateWorstCase(planned, alreadySpent);
    return { kind: estimate.worstCase > cap ? 'over-cap' : 'within-cap', estimate, cap };
};

const formatLine = (line: PreflightLine): string =>
    `${line.label}: ${countedText(line.runs, 'run')} x at most ${formatUsd(line.maxUsdPerRun)} = ${formatUsd(line.worstCase)}`;

/** The pre-flight as lines: what each group of runs may spend at most, and the decision against the cap. */
export const preflightLines = (decision: PreflightDecision): readonly string[] => [
    ...(decision.estimate.alreadySpent > 0
        ? [`already spent by earlier sessions of this recording: ${formatUsd(decision.estimate.alreadySpent)}`]
        : []),
    ...decision.estimate.lines.map(formatLine),
    `worst case ${formatUsd(decision.estimate.worstCase)}; cap ${formatUsd(decision.cap)}: ${decision.kind}`,
    'a retried attempt is paid from the same cap; the guard never lets the session cross it',
];
