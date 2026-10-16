import type { LanguageModelV4CallOptions, LanguageModelV4Usage } from '@ai-sdk/provider';
import { MockLanguageModelV4 } from 'ai/test';

import { goldAnswerFound } from '../../bed/index.ts';
import { modelIdSchema } from '../../trace/index.ts';

export const containmentJudgeModelId = modelIdSchema.parse('dry-run-containment-judge');

const zeroUsage: LanguageModelV4Usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
};

const promptText = (options: LanguageModelV4CallOptions): string =>
    options.prompt
        .flatMap((message) =>
            message.role === 'user' ? message.content.flatMap((part) => (part.type === 'text' ? [part.text] : [])) : [],
        )
        .join('\n');

const labelledLine = (text: string, label: string): string =>
    text
        .split('\n')
        .find((line) => line.startsWith(`${label}: `))
        ?.slice(label.length + 2) ?? '';

const verdictFor = (options: LanguageModelV4CallOptions): string => {
    const text = promptText(options);
    const found = goldAnswerFound({ answer: labelledLine(text, 'Gold answer') }, labelledLine(text, 'Answer to grade'));
    return JSON.stringify({
        correct: found === true,
        reason: `dry run: gold answer ${found === null ? 'is yes/no, not judged by containment' : found ? 'contained' : 'not contained'}`,
    });
};

/**
 * Stands in for the judge in a dry run: it grades by the bed's gold-answer containment rule, read from the judge
 * prompt, so the judge path (prompt, structured output, budget guard, fixture field) runs end to end offline.
 */
export const createContainmentJudgeModel = (): MockLanguageModelV4 =>
    new MockLanguageModelV4({
        modelId: containmentJudgeModelId,
        doGenerate: (options) =>
            Promise.resolve({
                content: [{ type: 'text', text: verdictFor(options) }],
                usage: zeroUsage,
                finishReason: { unified: 'stop', raw: 'end_turn' },
                warnings: [],
            }),
    });
