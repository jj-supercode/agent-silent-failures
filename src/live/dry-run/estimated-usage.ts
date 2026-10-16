import type {
    LanguageModelV4CallOptions,
    LanguageModelV4Content,
    LanguageModelV4Middleware,
    LanguageModelV4StreamPart,
    LanguageModelV4Usage,
} from '@ai-sdk/provider';

import { estimatePromptTokens, estimateTokensOfText } from '../budget/prompt-size.ts';

/** Only generated text and tool calls are billed output; other content parts carry no model tokens. */
const contentText = (content: LanguageModelV4Content): string => {
    if (content.type === 'text' || content.type === 'reasoning') {
        return content.text;
    }
    return content.type === 'tool-call' ? `${content.toolName}${content.input}` : '';
};

const estimatedUsage = (params: LanguageModelV4CallOptions, outputText: string): LanguageModelV4Usage => {
    const input = estimatePromptTokens(params);
    const output = estimateTokensOfText(outputText);
    return {
        inputTokens: { total: input, noCache: input, cacheRead: 0, cacheWrite: 0 },
        outputTokens: { total: output, text: output, reasoning: 0 },
    };
};

const streamedText = (part: LanguageModelV4StreamPart): string => {
    if (part.type === 'text-delta' || part.type === 'reasoning-delta') {
        return part.delta;
    }
    return part.type === 'tool-call' ? `${part.toolName}${part.input}` : '';
};

/**
 * A scripted model reports zero usage. In a dry run this middleware sits between it and the budget guard and reports
 * the guard's own conservative token estimates instead, so the guard and the spend summary run on realistic numbers.
 */
export const estimatedUsageMiddleware: LanguageModelV4Middleware = {
    specificationVersion: 'v4',
    wrapGenerate: async ({ doGenerate, params }) => {
        const result = await doGenerate();
        return { ...result, usage: estimatedUsage(params, result.content.map(contentText).join('')) };
    },
    wrapStream: async ({ doStream, params }) => {
        const result = await doStream();
        let outputText = '';
        return {
            ...result,
            stream: result.stream.pipeThrough(
                new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
                    transform: (part, controller) => {
                        outputText += streamedText(part);
                        controller.enqueue(
                            part.type === 'finish' ? { ...part, usage: estimatedUsage(params, outputText) } : part,
                        );
                    },
                }),
            ),
        };
    },
};
