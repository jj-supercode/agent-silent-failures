import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, test } from 'vitest';

import { questionIdSchema } from '../corpus/index.ts';
import { attemptAwareAgentModel } from './agent-model-layers.ts';
import { budgetKeySchema, usdSchema } from './budget/model.ts';
import { createSpendLedger } from './budget/session-ledger.ts';
import { AttemptAbandonedError, TransientProviderError } from './resilience/errors.ts';
import { createProviderFailureLog } from './resilience/provider-failure-log.ts';
import { withinRunScope, type RunScope } from './run-scope.ts';
import { overloadedError } from './testing.ts';

const callOptions: LanguageModelV4CallOptions = {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Who wrote it?' }] }],
};

const attemptScope = (): RunScope => ({
    scenario: { questionId: questionIdSchema.parse('5ab92e3c554299753720f777'), seed: 1 },
    budget: { runKey: budgetKeySchema.parse('run'), maxModelCalls: 12, maxUsd: usdSchema.parse(0.015) },
    providerFailures: createProviderFailureLog(),
});

describe('attemptAwareAgentModel', () => {
    test("charges a failed provider call, then refuses the attempt's next call without sending or charging it", async () => {
        let providerCalls = 0;
        const provider = new MockLanguageModelV4({
            doGenerate: () => {
                providerCalls += 1;
                return Promise.reject(overloadedError());
            },
        });
        const ledger = createSpendLedger({ cap: usdSchema.parse(1) });
        const model = attemptAwareAgentModel(provider, ledger);
        const scope = attemptScope();
        const call = () => withinRunScope(scope, () => Promise.resolve(model.doGenerate(callOptions)));

        await expect(call()).rejects.toThrow(TransientProviderError);
        expect(ledger.read().spend.callCount).toBe(1);

        await expect(call()).rejects.toThrow(AttemptAbandonedError);
        expect(providerCalls).toBe(1);
        expect(ledger.read().spend.callCount).toBe(1);
        expect(ledger.read().reserved).toBe(0);
    });
});
