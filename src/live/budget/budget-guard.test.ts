import type { LanguageModelV4CallOptions, LanguageModelV4StreamPart, LanguageModelV4Usage } from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { describe, expect, test } from 'vitest';

import { budgetGuardMiddleware } from './budget-guard.ts';
import { createSpendLedger } from './session-ledger.ts';
import { BudgetExceededError, CallOutsideRunError } from './errors.ts';
import { billedTokenCountSchema, budgetKeySchema, usdSchema } from './model.ts';
import { agentModelPrice } from './pricing.ts';
import type { RunBudgetScope } from './spend-ledger.ts';

const tokens = (count: number) => billedTokenCountSchema.parse(count);
const limits = { maxPromptTokens: tokens(10_000), maxOutputTokens: tokens(1_000) };
const run: RunBudgetScope = {
    runKey: budgetKeySchema.parse('run-1'),
    maxModelCalls: 10,
    maxUsd: usdSchema.parse(1),
};
const reportedInputTokens = 400;
const reportedOutputTokens = 60;

const usage = (input: number | undefined, output: number | undefined): LanguageModelV4Usage => ({
    inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: output, text: output, reasoning: 0 },
});

const callOptions: LanguageModelV4CallOptions = {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'What is the capital of France?' }] }],
};

const generatingModel = (reported: LanguageModelV4Usage, seenOutputLimits: (number | undefined)[] = []) =>
    new MockLanguageModelV4({
        doGenerate: (options) => {
            seenOutputLimits.push(options.maxOutputTokens);
            return Promise.resolve({
                content: [{ type: 'text', text: 'Paris' }],
                usage: reported,
                finishReason: { unified: 'stop', raw: 'end_turn' },
                warnings: [],
            });
        },
    });

const streamingModel = (reported: LanguageModelV4Usage) =>
    new MockLanguageModelV4({
        doStream: () =>
            Promise.resolve({
                stream: convertArrayToReadableStream<LanguageModelV4StreamPart>([
                    { type: 'stream-start', warnings: [] },
                    { type: 'finish', usage: reported, finishReason: { unified: 'stop', raw: 'end_turn' } },
                ]),
            }),
    });

const guarded = (model: MockLanguageModelV4, cap: number, currentRun: RunBudgetScope | null = run) => {
    const ledger = createSpendLedger({ cap: usdSchema.parse(cap) });
    return {
        ledger,
        model: wrapLanguageModel({
            model,
            middleware: budgetGuardMiddleware({ ledger, price: agentModelPrice, limits, currentRun: () => currentRun }),
        }),
    };
};

const drain = async (stream: ReadableStream<LanguageModelV4StreamPart>): Promise<number> =>
    (await Array.fromAsync(stream)).length;

describe('budgetGuardMiddleware', () => {
    test('charges the usage the provider reports for a generate call', async () => {
        const { ledger, model } = guarded(generatingModel(usage(reportedInputTokens, reportedOutputTokens)), 1);
        await model.doGenerate(callOptions);
        const { spend, reserved } = ledger.read();
        expect(spend.callCount).toBe(1);
        expect(spend.inputTokens).toBe(reportedInputTokens);
        expect(spend.outputTokens).toBe(reportedOutputTokens);
        expect(reserved).toBe(0);
    });

    test('caps the output tokens the model may produce per call', async () => {
        const seen: (number | undefined)[] = [];
        const { model } = guarded(generatingModel(usage(1, 1), seen), 1);
        await model.doGenerate({ ...callOptions, maxOutputTokens: 50_000 });
        await model.doGenerate(callOptions);
        expect(seen).toEqual([limits.maxOutputTokens, limits.maxOutputTokens]);
    });

    test('charges a missing usage count at the limit', async () => {
        const { ledger, model } = guarded(generatingModel(usage(undefined, undefined)), 1);
        await model.doGenerate(callOptions);
        expect(ledger.read().spend.inputTokens).toBe(limits.maxPromptTokens);
        expect(ledger.read().spend.outputTokens).toBe(limits.maxOutputTokens);
    });

    test('refuses a call before it is sent when its worst case could cross the cap', async () => {
        const seen: (number | undefined)[] = [];
        const { ledger, model } = guarded(generatingModel(usage(1, 1), seen), 0.000_001);
        await expect(model.doGenerate(callOptions)).rejects.toThrow(BudgetExceededError);
        expect(seen).toEqual([]);
        expect(ledger.read().refusal).toBeInstanceOf(BudgetExceededError);
    });

    test('refuses a call made outside a run scope', async () => {
        const { model } = guarded(generatingModel(usage(1, 1)), 1, null);
        await expect(model.doGenerate(callOptions)).rejects.toThrow(CallOutsideRunError);
    });

    test('charges a streamed call when its finish part arrives', async () => {
        const { ledger, model } = guarded(streamingModel(usage(reportedInputTokens, reportedOutputTokens)), 1);
        const { stream } = await model.doStream(callOptions);
        await drain(stream);
        expect(ledger.read().spend.inputTokens).toBe(reportedInputTokens);
        expect(ledger.read().reserved).toBe(0);
    });

    test('charges a failed call at its worst case', async () => {
        const failing = new MockLanguageModelV4({ doGenerate: () => Promise.reject(new Error('overloaded')) });
        const { ledger, model } = guarded(failing, 1);
        await expect(model.doGenerate(callOptions)).rejects.toThrow('overloaded');
        expect(ledger.read().spend.outputTokens).toBe(limits.maxOutputTokens);
    });

    test('charges a streamed call at its worst case when the consumer cancels before the finish part', async () => {
        const { ledger, model } = guarded(streamingModel(usage(reportedInputTokens, reportedOutputTokens)), 1);
        const { stream } = await model.doStream(callOptions);
        await stream.cancel();
        expect(ledger.read().spend.outputTokens).toBe(limits.maxOutputTokens);
        expect(ledger.read().reserved).toBe(0);
    });
});
