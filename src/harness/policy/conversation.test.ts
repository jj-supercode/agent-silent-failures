import type { LanguageModelV4Message } from '@ai-sdk/provider';
import { describe, expect, test } from 'vitest';

import { toConversation } from './conversation.ts';

const question = 'Who wrote it?';
const searchArgs = { query: 'author' };
const searchOutput = { hits: [] };

const prompt: LanguageModelV4Message[] = [
    { role: 'system', content: 'Answer from the corpus.' },
    { role: 'user', content: [{ type: 'text', text: question }] },
    {
        role: 'assistant',
        content: [{ type: 'tool-call', toolCallId: 'call-0', toolName: 'searchCorpus', input: searchArgs }],
    },
    {
        role: 'tool',
        content: [
            {
                type: 'tool-result',
                toolCallId: 'call-0',
                toolName: 'searchCorpus',
                output: { type: 'json', value: searchOutput },
            },
        ],
    },
    { role: 'assistant', content: [{ type: 'tool-call', toolCallId: 'call-1', toolName: 'clock', input: {} }] },
    {
        role: 'tool',
        content: [
            {
                type: 'tool-result',
                toolCallId: 'call-1',
                toolName: 'clock',
                output: { type: 'error-text', value: 'clock down' },
            },
        ],
    },
];

describe('toConversation', () => {
    test('reads the question from the first user message', () => {
        expect(toConversation({ prompt }).question).toBe(question);
    });

    test('pairs each tool result with the arguments of its call, in order', () => {
        expect(toConversation({ prompt }).exchanges).toEqual([
            { toolName: 'searchCorpus', args: searchArgs, output: searchOutput, failed: false },
            { toolName: 'clock', args: {}, output: 'clock down', failed: true },
        ]);
    });

    test('counts assistant turns, which is how the scripted model knows where it is', () => {
        expect(toConversation({ prompt }).assistantTurns).toBe(2);
    });

    test('lists the offered tool names', () => {
        const tools = [{ type: 'function' as const, name: 'searchCorpus', inputSchema: {} }];
        expect(toConversation({ prompt, tools }).offeredTools).toEqual(['searchCorpus']);
    });
});
