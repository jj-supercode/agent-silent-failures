import { randomUUID } from 'node:crypto';

import type {
    LanguageModelV4,
    LanguageModelV4Content,
    LanguageModelV4Message,
    LanguageModelV4Middleware,
    LanguageModelV4StreamPart,
} from '@ai-sdk/provider';
import { wrapLanguageModel } from 'ai';

import { createScriptedModel, interactiveScenario, type AgentPolicy } from '../harness/index.ts';

/**
 * The prompt from the latest user message on, after the system messages: the scripted policy reads the first user
 * message as its question and every tool result as its own, so earlier turns of a thread would answer the wrong one.
 */
export const latestQuestionPrompt = (prompt: readonly LanguageModelV4Message[]): readonly LanguageModelV4Message[] => {
    const latestUserIndex = prompt.findLastIndex((message) => message.role === 'user');
    return latestUserIndex === -1
        ? prompt
        : [
              ...prompt.slice(0, latestUserIndex).filter((message) => message.role === 'system'),
              ...prompt.slice(latestUserIndex),
          ];
};

/** The scripted ids restart with every question; a thread's history merges entries that share one. */
const withThreadUniqueId = <TPart extends LanguageModelV4Content | LanguageModelV4StreamPart>(part: TPart): TPart =>
    part.type === 'tool-call' ? { ...part, toolCallId: `${part.toolCallId}-${randomUUID()}` } : part;

const answerLatestQuestion: LanguageModelV4Middleware = {
    specificationVersion: 'v4',
    transformParams: ({ params }) => Promise.resolve({ ...params, prompt: [...latestQuestionPrompt(params.prompt)] }),
    wrapGenerate: async ({ doGenerate }) => {
        const result = await doGenerate();
        return { ...result, content: result.content.map(withThreadUniqueId) };
    },
    wrapStream: async ({ doStream }) => {
        const result = await doStream();
        return {
            ...result,
            stream: result.stream.pipeThrough(
                new TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart>({
                    transform: (part, controller) => controller.enqueue(withThreadUniqueId(part)),
                }),
            ),
        };
    },
};

/** A scripted model for a Studio thread with memory: each question is answered on its own, as in the bed. */
export const scriptedThreadModel = (policy: AgentPolicy): LanguageModelV4 =>
    wrapLanguageModel({ model: createScriptedModel(policy, interactiveScenario), middleware: answerLatestQuestion });
