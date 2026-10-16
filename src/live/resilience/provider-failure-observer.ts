import type { LanguageModelV4Middleware, LanguageModelV4StreamPart } from '@ai-sdk/provider';

import { TransientProviderError } from './errors.ts';
import { classifyProviderFailure } from './provider-failure.ts';
import type { ProviderFailureLog } from './provider-failure-log.ts';

export type ProviderFailureObserverInput = {
    /** The failure log of the attempt the current call belongs to, or `null` outside any attempt. */
    readonly currentLog: () => ProviderFailureLog | null;
};

/**
 * An AI SDK middleware, placed directly around the provider model (inside the budget guard), that records every failed
 * model call in the current attempt's log. A transient error is passed on as a `TransientProviderError`, which neither
 * the AI SDK nor Mastra retries: the run-level policy owns retries, so each one is counted and backed off.
 */
export const providerFailureObserver = ({ currentLog }: ProviderFailureObserverInput): LanguageModelV4Middleware => {
    const observed = (error: unknown): unknown => {
        const failure = classifyProviderFailure(error);
        currentLog()?.record(failure);
        return failure.kind === 'transient' ? new TransientProviderError(failure, error) : error;
    };
    const observedCall = async <T>(call: () => PromiseLike<T>): Promise<T> => {
        try {
            return await call();
        } catch (error) {
            throw observed(error);
        }
    };
    const recordingStreamErrors = () =>
        new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
            transform: (part, controller) => {
                if (part.type === 'error') {
                    currentLog()?.record(classifyProviderFailure(part.error));
                }
                controller.enqueue(part);
            },
        });
    return {
        specificationVersion: 'v4',
        wrapGenerate: ({ doGenerate }) => observedCall(doGenerate),
        wrapStream: async ({ doStream }) => {
            const result = await observedCall(doStream);
            return { ...result, stream: result.stream.pipeThrough(recordingStreamErrors()) };
        },
    };
};
