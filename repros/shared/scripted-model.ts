import type { LanguageModelV4Content, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { MockLanguageModelV4, convertArrayToReadableStream } from 'ai/test';

export type ScriptedTurn = readonly LanguageModelV4StreamPart[];

const mockUsage = {
    inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 5, text: 5, reasoning: 0 },
};

/** `toolCallId` must be unique per call: Mastra merges history entries that share one. */
export const toolCallTurn = (toolCallId: string, toolName: string, input: object): ScriptedTurn => [
    { type: 'stream-start', warnings: [] },
    { type: 'tool-call', toolCallId, toolName, input: JSON.stringify(input) },
    { type: 'finish', usage: mockUsage, finishReason: { unified: 'tool-calls', raw: 'tool_use' } },
];

export const textTurn = (text: string): ScriptedTurn => [
    { type: 'stream-start', warnings: [] },
    { type: 'text-start', id: 'text-1' },
    { type: 'text-delta', id: 'text-1', delta: text },
    { type: 'text-end', id: 'text-1' },
    { type: 'finish', usage: mockUsage, finishReason: { unified: 'stop', raw: 'end_turn' } },
];

const toGeneratedContent = (part: LanguageModelV4StreamPart): readonly LanguageModelV4Content[] =>
    part.type === 'tool-call' ? [part] : part.type === 'text-delta' ? [{ type: 'text', text: part.delta }] : [];

/**
 * Replays `turns` in order. The turn index is the number of assistant messages already in the prompt,
 * so every new run of the same agent starts the script over.
 */
export const scriptedModel = (modelId: string, turns: readonly ScriptedTurn[]): MockLanguageModelV4 => {
    const turnFor = (prompt: readonly { readonly role: string }[]): ScriptedTurn => {
        const assistantTurns = prompt.filter((message) => message.role === 'assistant').length;
        return turns[Math.min(assistantTurns, turns.length - 1)] ?? textTurn('done');
    };
    return new MockLanguageModelV4({
        modelId,
        doStream: ({ prompt }) => Promise.resolve({ stream: convertArrayToReadableStream([...turnFor(prompt)]) }),
        doGenerate: ({ prompt }) => {
            const turn = turnFor(prompt);
            const finish = turn.find((part) => part.type === 'finish');
            return Promise.resolve({
                content: turn.flatMap(toGeneratedContent),
                usage: mockUsage,
                finishReason: finish?.type === 'finish' ? finish.finishReason : { unified: 'stop', raw: undefined },
                warnings: [],
            });
        },
    });
};
