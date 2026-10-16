import { describe, expect, test } from 'vitest';

import { countCompletedToolCalls } from './prior-calls.ts';

const invocation = (toolName: string, state: string, toolCallId = `${toolName}-${state}`) => ({
    type: 'tool-invocation',
    toolInvocation: { toolName, toolCallId, state },
});
const message = (...parts: readonly unknown[]) => ({ content: { parts } });

describe('countCompletedToolCalls', () => {
    test('counts completed calls of the named tool only', () => {
        const messages = [
            message(invocation('searchCorpus', 'result'), invocation('clock', 'result')),
            message(invocation('searchCorpus', 'result'), invocation('searchCorpus', 'call')),
        ];
        expect(countCompletedToolCalls(messages, 'searchCorpus')).toBe(2);
    });

    test('ignores messages and parts of other shapes', () => {
        expect(
            countCompletedToolCalls(
                ['text', { content: 'plain' }, message({ type: 'text', text: 'hi' })],
                'searchCorpus',
            ),
        ).toBe(0);
    });
});
