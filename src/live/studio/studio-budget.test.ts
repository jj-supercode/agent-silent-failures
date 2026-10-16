import type { LanguageModelV4CallOptions, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { describe, expect, test } from 'vitest';

import { costOf, worstCaseCallCost } from '../budget/cost.ts';
import { RunBudgetExceededError } from '../budget/errors.ts';
import { billedTokenCountSchema, usdSchema } from '../budget/model.ts';
import { agentModelPrice } from '../budget/pricing.ts';
import { agentCallLimits } from '../run-limits.ts';
import { guardStudioModel } from './studio-budget.ts';
import type { StudioSpend } from './studio-spend.ts';

const reportedInputTokens = 2_400;
const reportedOutputTokens = 180;
const reportedUsage = {
    inputTokens: { total: reportedInputTokens, noCache: reportedInputTokens, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: reportedOutputTokens, text: reportedOutputTokens, reasoning: 0 },
};
const callOptions: LanguageModelV4CallOptions = {
    prompt: [
        { role: 'user', content: [{ type: 'text', text: 'Who died first, George Archainbaud or Ralph Murphy?' }] },
    ],
};
const callWorstCase = worstCaseCallCost(agentModelPrice, agentCallLimits);
const reportedCallCost = costOf(
    {
        inputTokens: billedTokenCountSchema.parse(reportedInputTokens),
        outputTokens: billedTokenCountSchema.parse(reportedOutputTokens),
    },
    agentModelPrice,
);

const answeringModel = () =>
    new MockLanguageModelV4({
        doGenerate: () =>
            Promise.resolve({
                content: [{ type: 'text', text: 'George Archainbaud [S1].' }],
                usage: reportedUsage,
                finishReason: { unified: 'stop', raw: 'end_turn' },
                warnings: [],
            }),
        doStream: () =>
            Promise.resolve({
                stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
                    { type: 'stream-start', warnings: [] },
                    { type: 'finish', usage: reportedUsage, finishReason: { unified: 'stop', raw: 'end_turn' } },
                ]),
            }),
    });

const guardedWithReports = (cap: number) => {
    const reports: StudioSpend[] = [];
    const model = guardStudioModel(answeringModel(), {
        cap: usdSchema.parse(cap),
        onSpend: (spend) => reports.push(spend),
    });
    return { model, reports };
};

describe('guardStudioModel', () => {
    test('calls outside any recorded run are charged to the Studio session and reported once each', async () => {
        const { model, reports } = guardedWithReports(1);
        await model.doGenerate(callOptions);
        await model.doGenerate(callOptions);
        expect(reports.map((report) => report.spend.callCount)).toEqual([1, 2]);
        expect(reports.at(-1)?.spend.inputTokens).toBe(2 * reportedInputTokens);
        expect(reports.at(-1)?.spend.outputTokens).toBe(2 * reportedOutputTokens);
    });

    test('a streamed call is reported when its stream finishes', async () => {
        const { model, reports } = guardedWithReports(1);
        const { stream } = await model.doStream(callOptions);
        expect(reports).toEqual([]);
        await Array.fromAsync(stream);
        expect(reports.map((report) => report.spend.callCount)).toEqual([1]);
    });

    test('refuses a call whose worst case could cross the session cap, before it is sent', async () => {
        const { model, reports } = guardedWithReports(callWorstCase + reportedCallCost / 2);
        await model.doGenerate(callOptions);
        expect(reports.at(-1)?.capReached).toBe(true);
        await expect(model.doGenerate(callOptions)).rejects.toThrow(RunBudgetExceededError);
        expect(reports).toHaveLength(1);
    });
});
