import { describe, expect, test } from 'vitest';

import { usdSchema } from './model.ts';
import { decidePreflight, estimateWorstCase, preflightLines, type PlannedRuns } from './preflight.ts';

const usd = (amount: number) => usdSchema.parse(amount);

const plan: readonly PlannedRuns[] = [
    { label: 'single agent', runs: 300, maxUsdPerRun: usd(0.015) },
    { label: 'multi agent', runs: 100, maxUsdPerRun: usd(0.04) },
];

describe('estimateWorstCase', () => {
    test('multiplies runs by their per-run cap for each group, then sums', () => {
        const estimate = estimateWorstCase(plan);
        expect(estimate.worstCase).toBeCloseTo(300 * 0.015 + 100 * 0.04);
        expect(estimate.lines.map((line) => line.worstCase)).toEqual([expect.closeTo(4.5), expect.closeTo(4)]);
    });

    test('is zero for an empty plan', () => {
        expect(estimateWorstCase([]).worstCase).toBe(0);
    });

    test('adds what earlier sessions of a resumed recording already spent', () => {
        const alreadySpent = 0.25;
        expect(estimateWorstCase(plan, usd(alreadySpent)).worstCase).toBeCloseTo(
            alreadySpent + 300 * 0.015 + 100 * 0.04,
        );
    });
});

describe('decidePreflight', () => {
    test('refuses a plan whose worst case is above the cap', () => {
        expect(decidePreflight(plan, usd(8)).kind).toBe('over-cap');
    });

    test('accepts a plan whose worst case fits the cap', () => {
        const decision = decidePreflight(plan, usd(9));
        expect(decision.kind).toBe('within-cap');
        expect(preflightLines(decision).join('\n')).toContain('within-cap');
    });

    test('refuses a resumed plan that fits on its own but not on top of the earlier spend', () => {
        const alreadySpent = usd(0.6);
        const decision = decidePreflight(plan, usd(9), alreadySpent);
        expect(decision.kind).toBe('over-cap');
        expect(preflightLines(decision).join('\n')).toContain('already spent by earlier sessions');
    });
});
