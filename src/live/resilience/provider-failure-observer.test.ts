import { APICallError, type LanguageModelV4CallOptions, type LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';
import { describe, expect, test } from 'vitest';

import { badRequestError, overloadedError } from '../testing.ts';
import { TransientProviderError } from './errors.ts';
import { createProviderFailureLog } from './provider-failure-log.ts';
import { providerFailureObserver } from './provider-failure-observer.ts';

const callOptions: LanguageModelV4CallOptions = {
    prompt: [{ role: 'user', content: [{ type: 'text', text: 'Who wrote it?' }] }],
};

const failingWith = (error: Error) => new MockLanguageModelV4({ doGenerate: () => Promise.reject(error) });

const observedModel = (model: MockLanguageModelV4) => {
    const log = createProviderFailureLog();
    return {
        log,
        model: wrapLanguageModel({ model, middleware: providerFailureObserver({ currentLog: () => log }) }),
    };
};

describe('providerFailureObserver', () => {
    test('records a transient failure and hands it on as an error the AI SDK will not retry by itself', async () => {
        const original = overloadedError();
        const { log, model } = observedModel(failingWith(original));
        const thrown = await Promise.resolve(model.doGenerate(callOptions)).catch((error: unknown) => error);
        expect(thrown).toBeInstanceOf(TransientProviderError);
        expect(APICallError.isInstance(thrown)).toBe(false);
        expect(thrown instanceof TransientProviderError ? thrown.providerError : null).toBe(original);
        expect(thrown instanceof Error ? thrown.cause : null).toBeUndefined();
        expect(log.failures()).toEqual([{ kind: 'transient', reason: 'HTTP 529: Overloaded', retryAfter: null }]);
    });

    test('records a permanent failure and passes the original error through untouched', async () => {
        const original = badRequestError();
        const { log, model } = observedModel(failingWith(original));
        await expect(model.doGenerate(callOptions)).rejects.toBe(original);
        expect(log.failures().map((failure) => failure.kind)).toEqual(['permanent']);
    });

    test('records an error event in the middle of a stream and keeps the stream going', async () => {
        const parts: LanguageModelV4StreamPart[] = [
            { type: 'stream-start', warnings: [] },
            { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
        ];
        const { log, model } = observedModel(
            new MockLanguageModelV4({
                doStream: () => Promise.resolve({ stream: convertArrayToReadableStream(parts) }),
            }),
        );
        const { stream } = await model.doStream(callOptions);
        expect(await Array.fromAsync(stream)).toHaveLength(parts.length);
        expect(log.failures().map((failure) => failure.kind)).toEqual(['transient']);
    });

    test('records nothing for a call that succeeds', async () => {
        const { log, model } = observedModel(
            new MockLanguageModelV4({
                doGenerate: () =>
                    Promise.resolve({
                        content: [{ type: 'text', text: 'Paris' }],
                        usage: {
                            inputTokens: { total: 1, noCache: 1, cacheRead: 0, cacheWrite: 0 },
                            outputTokens: { total: 1, text: 1, reasoning: 0 },
                        },
                        finishReason: { unified: 'stop', raw: 'end_turn' },
                        warnings: [],
                    }),
            }),
        );
        await model.doGenerate(callOptions);
        expect(log.failures()).toEqual([]);
    });
});
