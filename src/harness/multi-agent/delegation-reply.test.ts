import type { DelegationCompleteContext } from '@mastra/core/agent';
import { describe, expect, test } from 'vitest';

import { delegationReplyHook } from './delegation-reply.ts';

const completed = (text: string): DelegationCompleteContext => ({
    primitiveId: 'researcher-agent',
    primitiveType: 'agent',
    prompt: 'Look up Monstera.',
    result: { text },
    duration: 1,
    success: true,
    iteration: 2,
    runId: 'run-1',
    toolCallId: 'call-1',
    parentAgentId: 'supervisor-agent',
    parentAgentName: 'Supervisor',
    messages: [],
    bail: () => undefined,
});

describe('delegationReplyHook', () => {
    test('a changed reply replaces the text the supervisor reads', () => {
        const hook = delegationReplyHook([(reply) => reply.toUpperCase(), (reply) => `${reply}!`]);
        expect(hook(completed('monstera'))).toEqual({ resultText: 'MONSTERA!' });
    });

    test('an unchanged reply leaves the delegation as Mastra returned it', () => {
        expect(delegationReplyHook([(reply) => reply])(completed('Monstera [S1].'))).toBeUndefined();
    });

    test('wrappers see which worker replied and on which delegation', () => {
        const seen: unknown[] = [];
        delegationReplyHook([
            (reply, delegation) => {
                seen.push(delegation);
                return reply;
            },
        ])(completed('Monstera'));
        expect(seen).toEqual([{ workerId: 'researcher-agent', iteration: 2 }]);
    });
});
