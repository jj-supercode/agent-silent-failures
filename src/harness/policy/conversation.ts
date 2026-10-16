import type { LanguageModelV4CallOptions, LanguageModelV4Message } from '@ai-sdk/provider';

import { toolNameSchema, type ToolName } from '../../trace/index.ts';
import type { Conversation, ToolExchange } from './model.ts';

type ToolResultOutput = Extract<
    Extract<LanguageModelV4Message, { role: 'tool' }>['content'][number],
    { type: 'tool-result' }
>['output'];

const decodeToolOutput = (output: ToolResultOutput): Pick<ToolExchange, 'output' | 'failed'> => {
    switch (output.type) {
        case 'json':
        case 'text':
            return { output: output.value, failed: false };
        case 'error-json':
        case 'error-text':
            return { output: output.value, failed: true };
        case 'execution-denied':
            return { output: output.reason ?? 'execution denied', failed: true };
        case 'content':
            return { output: output.value, failed: false };
        default:
            return output satisfies never;
    }
};

/** A provider part with an empty tool name names no tool, so it is dropped rather than branded. */
const toolNames = (name: string): readonly ToolName[] => {
    const parsed = toolNameSchema.safeParse(name);
    return parsed.success ? [parsed.data] : [];
};

const firstUserText = (prompt: readonly LanguageModelV4Message[]): string =>
    prompt
        .find((message) => message.role === 'user')
        ?.content.flatMap((part) => (part.type === 'text' ? [part.text] : []))
        .join('\n') ?? '';

const toolCallsById = (prompt: readonly LanguageModelV4Message[]): ReadonlyMap<string, unknown> =>
    new Map(
        prompt.flatMap((message) =>
            message.role === 'assistant'
                ? message.content.flatMap((part) => (part.type === 'tool-call' ? [[part.toolCallId, part.input]] : []))
                : [],
        ),
    );

const toolExchanges = (prompt: readonly LanguageModelV4Message[]): readonly ToolExchange[] => {
    const argsById = toolCallsById(prompt);
    return prompt.flatMap((message) =>
        message.role === 'tool'
            ? message.content.flatMap((part) =>
                  part.type === 'tool-result'
                      ? toolNames(part.toolName).map((toolName) => ({
                            toolName,
                            args: argsById.get(part.toolCallId),
                            ...decodeToolOutput(part.output),
                        }))
                      : [],
              )
            : [],
    );
};

export const toConversation = (options: Pick<LanguageModelV4CallOptions, 'prompt' | 'tools'>): Conversation => ({
    question: firstUserText(options.prompt),
    exchanges: toolExchanges(options.prompt),
    assistantTurns: options.prompt.filter((message) => message.role === 'assistant').length,
    offeredTools: (options.tools ?? []).flatMap((tool) => toolNames(tool.name)),
});
