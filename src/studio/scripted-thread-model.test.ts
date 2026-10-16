import type { LanguageModelV4CallOptions, LanguageModelV4Message } from '@ai-sdk/provider';
import { describe, expect, test } from 'vitest';

import { searchCorpusToolId, type AgentPolicy } from '../harness/index.ts';
import { latestQuestionPrompt, scriptedThreadModel } from './scripted-thread-model.ts';

const system: LanguageModelV4Message = { role: 'system', content: 'Answer from the corpus.' };
const userAsks = (text: string): LanguageModelV4Message => ({ role: 'user', content: [{ type: 'text', text }] });
const firstQuestion = 'Which genus has more species, Monstera or Cercis?';
const secondQuestion = 'Who died first, George Archainbaud or Ralph Murphy?';

const searchCall: LanguageModelV4Message = {
    role: 'assistant',
    content: [{ type: 'tool-call', toolCallId: 'call-0', toolName: searchCorpusToolId, input: { query: 'Monstera' } }],
};
const searchResult: LanguageModelV4Message = {
    role: 'tool',
    content: [
        {
            type: 'tool-result',
            toolCallId: 'call-0',
            toolName: searchCorpusToolId,
            output: { type: 'json', value: { hits: [] } },
        },
    ],
};
const earlierTurn: readonly LanguageModelV4Message[] = [
    userAsks(firstQuestion),
    searchCall,
    searchResult,
    { role: 'assistant', content: [{ type: 'text', text: 'Monstera [S1].' }] },
];

/** Searches once for the question it reads, then answers by repeating it. */
const echoQuestionPolicy: AgentPolicy = (conversation) =>
    conversation.exchanges.length === 0
        ? { kind: 'call-tool', toolName: searchCorpusToolId, args: { query: conversation.question } }
        : { kind: 'answer', text: conversation.question };

const callWith = (prompt: readonly LanguageModelV4Message[]): LanguageModelV4CallOptions => ({ prompt: [...prompt] });

describe('latestQuestionPrompt', () => {
    test('keeps the system messages and the latest question, dropping earlier turns of the thread', () => {
        expect(latestQuestionPrompt([system, ...earlierTurn, userAsks(secondQuestion)])).toEqual([
            system,
            userAsks(secondQuestion),
        ]);
    });

    test('keeps the steps the agent already took on the latest question', () => {
        const ongoing = [userAsks(secondQuestion), searchCall, searchResult];
        expect(latestQuestionPrompt([system, ...earlierTurn, ...ongoing])).toEqual([system, ...ongoing]);
    });

    test('a prompt without a user message is left as it is', () => {
        expect(latestQuestionPrompt([system])).toEqual([system]);
    });
});

describe('scriptedThreadModel', () => {
    test('answers the latest question of a thread, not the first', async () => {
        const model = scriptedThreadModel(echoQuestionPolicy);
        const result = await model.doGenerate(callWith([system, ...earlierTurn, userAsks(secondQuestion)]));
        expect(result.content).toEqual([
            expect.objectContaining({ type: 'tool-call', input: JSON.stringify({ query: secondQuestion }) }),
        ]);
    });

    test('gives every tool call an id no earlier turn of the thread can share', async () => {
        const model = scriptedThreadModel(echoQuestionPolicy);
        const generated = await model.doGenerate(callWith([system, userAsks(secondQuestion)]));
        const { stream } = await model.doStream(callWith([system, userAsks(secondQuestion)]));
        const streamed = await Array.fromAsync(stream);
        const ids = [...generated.content, ...streamed].flatMap((part) =>
            part.type === 'tool-call' ? [part.toolCallId] : [],
        );
        expect(ids).toHaveLength(2);
        expect(new Set(ids).size).toBe(2);
        expect(ids).not.toContain('call-0');
    });
});
