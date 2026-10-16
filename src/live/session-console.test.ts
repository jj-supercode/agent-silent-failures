import { describe, expect, test } from 'vitest';

import { emptySpend, usdSchema } from './budget/model.ts';
import { decidePreflight } from './budget/preflight.ts';
import { defaultMaxUsd, type LiveOptions } from './live-options.ts';
import { millisecondsSchema } from './resilience/model.ts';
import { budgetCounts, recordedSessionReport, sessionHeader } from './session-console.ts';
import { spendContextOf, toSpendSummary } from './spend-summary.ts';

const plannedRuns = 4;
const maxUsdPerRun = 0.015;
const estimatedSpend = 0.0021;

const optionsFor = (mode: LiveOptions['mode']): LiveOptions => ({
    mode,
    maxUsd: defaultMaxUsd,
    judge: false,
    recording: { kind: 'new', maxRuns: null, outputDirectory: null },
});

const preflight = decidePreflight(
    [{ label: 'single-agent runs', runs: plannedRuns, maxUsdPerRun: usdSchema.parse(maxUsdPerRun) }],
    defaultMaxUsd,
);

const finishedSession = (mode: LiveOptions['mode'], stoppedEarly: string | null) => {
    const options = optionsFor(mode);
    return recordedSessionReport({
        options,
        plannedRuns,
        preflight,
        outcome: {
            recordedRuns: plannedRuns,
            failedRuns: 0,
            retriedRuns: [],
            networkPaused: millisecondsSchema.parse(0),
            stoppedEarly,
        },
        spend: toSpendSummary({
            ...spendContextOf(options, preflight.estimate.worstCase),
            spend: { ...emptySpend, spent: usdSchema.parse(estimatedSpend) },
            stoppedEarly,
            retriedRuns: [],
        }),
        directory: 'fixtures/dry-run/2026-10-15',
        fixtureDirectory: '/repo/fixtures/dry-run/2026-10-15',
    });
};

describe('demo:live console', () => {
    test('the header states the mode and the budget at the guard precision', () => {
        expect(sessionHeader(optionsFor('dry-run'), plannedRuns, preflight).facts).toEqual([
            ['mode', expect.stringContaining('dry run')],
            ['budget', 'worst case USD 0.0600 of a USD 10.0000 cap (within the cap)'],
        ]);
    });

    test('a dry run reports no spend, its estimate as a count, and the pre-flight figures', () => {
        const report = finishedSession('dry-run', null);
        expect(report.spendUsd).toBeNull();
        expect(report.counts).toMatchObject({
            estimatedSpendUsd: estimatedSpend,
            ...budgetCounts(preflight),
        });
        expect(report.exit.code).toBe(0);
    });

    test('a live session reports its billed spend; a stopped one exits 4 and offers the resume command first', () => {
        const report = finishedSession('live', 'network outage');
        expect(report.spendUsd).toBe(estimatedSpend);
        expect(report.exit.code).toBe(4);
        expect(report.next[0]?.command).toBe('pnpm demo:live --resume /repo/fixtures/dry-run/2026-10-15');
    });
});
