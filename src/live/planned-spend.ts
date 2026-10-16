import type { RunSpec } from '../bed/index.ts';
import type { PlannedRuns } from './budget/preflight.ts';
import { judgeRunLimits, runLimits } from './run-limits.ts';

/** The pre-flight groups of a live plan: agent runs by harness at their run caps, plus one judge call per run. */
export const plannedSpend = (runs: readonly RunSpec[], judge: boolean): readonly PlannedRuns[] => {
    const single = runs.filter((spec) => spec.harness === 'single-agent').length;
    const multi = runs.length - single;
    return [
        { label: 'single-agent runs', runs: single, maxUsdPerRun: runLimits['single-agent'].maxUsd },
        { label: 'supervisor runs (workers included)', runs: multi, maxUsdPerRun: runLimits['multi-agent'].maxUsd },
        ...(judge ? [{ label: 'judge calls', runs: runs.length, maxUsdPerRun: judgeRunLimits.maxUsd }] : []),
    ];
};
