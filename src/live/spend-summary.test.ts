import { describe, expect, test } from 'vitest';

import { billedTokenCountSchema, emptySpend, usdSchema, type SpendState } from './budget/model.ts';
import type { LiveOptions } from './live-options.ts';
import { formatSpend, recordedSpendSchema, spendContextOf, spendStateOf, toSpendSummary } from './spend-summary.ts';

const options: LiveOptions = {
    mode: 'dry-run',
    maxUsd: usdSchema.parse(10),
    judge: false,
    recording: { kind: 'new', maxRuns: null, outputDirectory: null },
};

const spendOf = (spent: number, callCount: number): SpendState => ({
    spent: usdSchema.parse(spent),
    callCount,
    inputTokens: billedTokenCountSchema.parse(callCount * 1_000),
    outputTokens: billedTokenCountSchema.parse(callCount * 100),
});

const summaryOf = (spend: SpendState) =>
    toSpendSummary({
        ...spendContextOf(options, usdSchema.parse(9.48)),
        spend,
        stoppedEarly: null,
        retriedRuns: [],
    });

describe('formatSpend', () => {
    test('reports a first session as it always did', () => {
        const line = formatSpend(summaryOf(spendOf(0.36, 1_752)), emptySpend);
        expect(line).toMatch(/^Estimated spend \(dry run, nothing billed\): USD 0\.3600 over 1752 model calls/);
        expect(line).not.toContain('this session');
    });

    test("names a resumed session's own share next to the whole recording's spend", () => {
        const line = formatSpend(summaryOf(spendOf(0.5, 60)), spendOf(0.2, 20));
        expect(line).toContain('for the whole recording: USD 0.5000 over 60 model calls');
        expect(line).toContain('of which this session USD 0.3000 over 40 calls');
    });
});

describe('recordedSpendSchema', () => {
    test('reads a summary written before retries were recorded as having none', () => {
        const legacy = {
            mode: 'live',
            spentUsd: 0.34,
            modelCalls: 1_393,
            inputTokens: 2_368_719,
            outputTokens: 208_438,
        };
        const read = recordedSpendSchema.parse(legacy);
        expect(read.retriedRuns).toEqual([]);
        expect(spendStateOf(read)).toEqual({
            spent: 0.34,
            callCount: 1_393,
            inputTokens: 2_368_719,
            outputTokens: 208_438,
        });
    });
});
