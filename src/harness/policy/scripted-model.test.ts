import type { LanguageModelV4CallOptions } from '@ai-sdk/provider';
import { describe, expect, test } from 'vitest';

import { questionIdSchema } from '../../corpus/index.ts';
import { searchCorpusToolId } from '../search/search-corpus-tool.ts';
import type { AgentPolicy } from './model.ts';
import { createScriptedModel } from './scripted-model.ts';

const scenario = { questionId: questionIdSchema.parse('q1'), seed: 3 };
const firstTurn: LanguageModelV4CallOptions = { prompt: [{ role: 'user', content: [{ type: 'text', text: 'Why?' }] }] };
const callThenAnswer: AgentPolicy = (conversation) =>
    conversation.exchanges.length === 0
        ? { kind: 'call-tool', toolName: searchCorpusToolId, args: { query: conversation.question } }
        : { kind: 'answer', text: 'Because [S1]' };

describe('createScriptedModel', () => {
    test('generate returns the policy turn as a tool call with a turn-scoped id', async () => {
        const result = await createScriptedModel(callThenAnswer, scenario).doGenerate(firstTurn);
        expect(result.content).toEqual([
            {
                type: 'tool-call',
                toolCallId: 'call-0',
                toolName: 'searchCorpus',
                input: JSON.stringify({ query: 'Why?' }),
            },
        ]);
        expect(result.finishReason.unified).toBe('tool-calls');
    });

    test('stream serves the same turn, framed by stream-start and finish', async () => {
        const { stream } = await createScriptedModel(callThenAnswer, scenario).doStream(firstTurn);
        const parts = await Array.fromAsync(stream);
        expect(parts.map((part) => part.type)).toEqual(['stream-start', 'tool-call', 'finish']);
    });

    test('stream emits an answer as one text block', async () => {
        const policy: AgentPolicy = () => ({ kind: 'answer', text: 'Done' });
        const { stream } = await createScriptedModel(policy, scenario).doStream(firstTurn);
        const parts = await Array.fromAsync(stream);
        expect(parts.flatMap((part) => (part.type === 'text-delta' ? [part.delta] : []))).toEqual(['Done']);
    });
});
