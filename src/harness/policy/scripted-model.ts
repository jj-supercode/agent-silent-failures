import type {
    LanguageModelV4CallOptions,
    LanguageModelV4Content,
    LanguageModelV4FinishReason,
    LanguageModelV4StreamPart,
    LanguageModelV4Usage,
} from '@ai-sdk/provider';
import { convertArrayToReadableStream, MockLanguageModelV4 } from 'ai/test';

import { modelIdSchema } from '../../trace/index.ts';
import type { ScenarioContext } from '../scenario.ts';
import { toConversation } from './conversation.ts';
import type { AgentPolicy, PolicyTurn } from './model.ts';
import { createDraw } from './seeded-draw.ts';

export const scriptedModelId = modelIdSchema.parse('scripted-policy');

const zeroUsage: LanguageModelV4Usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const finishReasonFor = (turn: PolicyTurn): LanguageModelV4FinishReason =>
    turn.kind === 'call-tool' ? { unified: 'tool-calls', raw: 'tool_use' } : { unified: 'stop', raw: 'end_turn' };

/** Tool call ids must be unique within a run: Mastra merges history entries that share one. */
const toolCallId = (turnIndex: number): string => `call-${turnIndex}`;

const toContent = (turn: PolicyTurn, turnIndex: number): LanguageModelV4Content => {
    switch (turn.kind) {
        case 'call-tool':
            return {
                type: 'tool-call',
                toolCallId: toolCallId(turnIndex),
                toolName: turn.toolName,
                input: JSON.stringify(turn.args),
            };
        case 'answer':
            return { type: 'text', text: turn.text };
        default:
            return turn satisfies never;
    }
};

/** Streams the same content `generate` returns: a tool call as one part, text as one start/delta/end block. */
const toContentStreamParts = (content: LanguageModelV4Content, turnIndex: number): LanguageModelV4StreamPart[] => {
    if (content.type === 'tool-call') {
        return [content];
    }
    if (content.type === 'text') {
        const id = `text-${turnIndex}`;
        return [
            { type: 'text-start', id },
            { type: 'text-delta', id, delta: content.text },
            { type: 'text-end', id },
        ];
    }
    return [];
};

const toStreamParts = (turn: PolicyTurn, turnIndex: number): LanguageModelV4StreamPart[] => [
    { type: 'stream-start', warnings: [] },
    ...toContentStreamParts(toContent(turn, turnIndex), turnIndex),
    { type: 'finish', usage: zeroUsage, finishReason: finishReasonFor(turn) },
];

/**
 * An offline language model driven by a policy. The turn is derived from the prompt (never a closure counter),
 * so the same agent can run many scenarios, and both `generate` and `stream` paths are served.
 */
export const createScriptedModel = (policy: AgentPolicy, scenario: ScenarioContext): MockLanguageModelV4 => {
    const decide = (options: LanguageModelV4CallOptions) => {
        const conversation = toConversation(options);
        const turnIndex = conversation.assistantTurns;
        return {
            turn: policy(conversation, createDraw(scenario.seed, [scenario.questionId, turnIndex])),
            turnIndex,
        };
    };
    return new MockLanguageModelV4({
        modelId: scriptedModelId,
        doGenerate: (options) => {
            const { turn, turnIndex } = decide(options);
            return Promise.resolve({
                content: [toContent(turn, turnIndex)],
                usage: zeroUsage,
                finishReason: finishReasonFor(turn),
                warnings: [],
            });
        },
        doStream: (options) => {
            const { turn, turnIndex } = decide(options);
            return Promise.resolve({ stream: convertArrayToReadableStream(toStreamParts(turn, turnIndex)) });
        },
    });
};
