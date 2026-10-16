import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';
import { describe, expect, test } from 'vitest';

import { questionIdSchema } from '../../corpus/index.ts';
import { createScriptedModel, type AgentPolicy, type ScenarioContext } from '../../harness/index.ts';
import { createDryRunModel } from './dry-run-model.ts';
import { DryRunOutsideRunError } from './errors.ts';
import { estimatedUsageMiddleware } from './estimated-usage.ts';

/** Answers with the draw it got, so a test can see which scenario the model served. */
const drawEchoPolicy: AgentPolicy = (_conversation, draw) => ({ kind: 'answer', text: `draw ${draw('answer')}` });

const scenario: ScenarioContext = { questionId: questionIdSchema.parse('q-1'), seed: 42 };

const callOptions: LanguageModelV4CallOptions = {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Which river runs through Paris?' }] }],
};

describe('createDryRunModel', () => {
    test('serves exactly what the scripted model serves for the run in scope', async () => {
        const dryRun = await createDryRunModel(drawEchoPolicy, () => scenario).doGenerate(callOptions);
        const scripted = await createScriptedModel(drawEchoPolicy, scenario).doGenerate(callOptions);
        expect(dryRun.content).toEqual(scripted.content);
    });

    test('a different run in scope draws differently', async () => {
        const first = await createDryRunModel(drawEchoPolicy, () => scenario).doGenerate(callOptions);
        const second = await createDryRunModel(drawEchoPolicy, () => ({ ...scenario, seed: 43 })).doGenerate(
            callOptions,
        );
        expect(first.content).not.toEqual(second.content);
    });

    test('refuses to answer outside a run scope', () => {
        expect(() => createDryRunModel(drawEchoPolicy, () => null).doGenerate(callOptions)).toThrow(
            DryRunOutsideRunError,
        );
    });
});

describe('estimatedUsageMiddleware', () => {
    test('replaces the scripted zero usage with positive estimates', async () => {
        const model = wrapLanguageModel({
            model: createDryRunModel(drawEchoPolicy, () => scenario),
            middleware: estimatedUsageMiddleware,
        });
        const { usage } = await model.doGenerate(callOptions);
        expect(usage.inputTokens.total).toBeGreaterThan(0);
        expect(usage.outputTokens.total).toBeGreaterThan(0);
    });

    test('estimates a streamed call too', async () => {
        const model = wrapLanguageModel({
            model: createDryRunModel(drawEchoPolicy, () => scenario),
            middleware: estimatedUsageMiddleware,
        });
        const { stream } = await model.doStream(callOptions);
        const finish = (await Array.fromAsync(stream)).find((part) => part.type === 'finish');
        expect(finish?.type === 'finish' && finish.usage.outputTokens.total).toBeGreaterThan(0);
    });
});
