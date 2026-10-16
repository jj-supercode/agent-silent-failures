import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, test } from 'vitest';

import { abandonedAttemptGate } from './abandoned-attempt-gate.ts';
import { AttemptAbandonedError } from './errors.ts';
import { createProviderFailureLog } from './provider-failure-log.ts';

const callOptions: LanguageModelV4CallOptions = {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Who wrote it?' }] }],
};

const answering = () => {
    let calls = 0;
    const model = new MockLanguageModelV4({
        doGenerate: () => {
            calls += 1;
            return Promise.resolve({
                content: [{ type: 'text', text: 'Paris' }],
                usage: {
                    inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                    outputTokens: { total: 1, text: 1, reasoning: 0 },
                },
                finishReason: { unified: 'stop', raw: 'end_turn' },
                warnings: [],
            });
        },
    });
    return { model, calls: () => calls };
};

const gated = (model: MockLanguageModelV4) => {
    const log = createProviderFailureLog();
    return { log, model: wrapLanguageModel({ model, middleware: abandonedAttemptGate({ currentLog: () => log }) }) };
};

describe('abandonedAttemptGate', () => {
    test('lets calls through while the attempt has met no transient failure', async () => {
        const provider = answering();
        const { log, model } = gated(provider.model);
        log.record({ kind: 'permanent', reason: 'HTTP 400: bad request' });
        await model.doGenerate(callOptions);
        expect(provider.calls()).toBe(1);
    });

    test('refuses every further call of an attempt that already failed transiently, without sending it', async () => {
        const provider = answering();
        const { log, model } = gated(provider.model);
        log.record({ kind: 'transient', reason: 'HTTP 529: Overloaded', retryAfter: null });
        await expect(Promise.resolve(model.doGenerate(callOptions))).rejects.toThrow(AttemptAbandonedError);
        expect(provider.calls()).toBe(0);
    });
});
