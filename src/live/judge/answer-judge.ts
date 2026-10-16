import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import { z } from 'zod';

import { agentIdSchema } from '../../trace/index.ts';

export const answerJudgeId = agentIdSchema.parse('answer-judge');

export const answerJudgementSchema = z.object({
    correct: z.boolean(),
    reason: z.string(),
});

/** A judge verdict on one answer, or why there is none. Never thrown: a judge failure must not lose the run. */
export type AnswerJudgement =
    | ({ readonly kind: 'judged' } & z.infer<typeof answerJudgementSchema>)
    | { readonly kind: 'not-judged'; readonly reason: string };

export type JudgedAnswer = {
    readonly question: string;
    readonly goldAnswer: string;
    readonly answer: string;
};

const judgeInstructions = [
    'You grade answers to multi-hop questions against a gold answer.',
    'An answer is correct when it states the gold answer or an unambiguous equivalent; extra correct detail is fine.',
    'An abstention, a different entity or a contradiction is incorrect. Give a one-sentence reason.',
].join('\n');

export const createAnswerJudge = (model: MastraModelConfig) =>
    new Agent({
        id: answerJudgeId,
        name: 'Answer judge',
        description: 'Grades an agent answer against the gold answer of its question.',
        instructions: judgeInstructions,
        model,
    });

export type AnswerJudge = ReturnType<typeof createAnswerJudge>;

const judgePrompt = ({ question, goldAnswer, answer }: JudgedAnswer): string =>
    [`Question: ${question}`, `Gold answer: ${goldAnswer}`, `Answer to grade: ${answer}`].join('\n');

export const judgeAnswer = async (judge: AnswerJudge, judged: JudgedAnswer): Promise<AnswerJudgement> => {
    try {
        const response = await judge.generate(judgePrompt(judged), {
            structuredOutput: { schema: answerJudgementSchema },
        });
        const judgement = answerJudgementSchema.safeParse(response.object);
        return judgement.success
            ? { kind: 'judged', ...judgement.data }
            : {
                  kind: 'not-judged',
                  reason: `judge output did not match its schema: ${z.prettifyError(judgement.error)}`,
              };
    } catch (error) {
        return {
            kind: 'not-judged',
            reason: error instanceof Error ? `${error.name}: ${error.message}` : String(error),
        };
    }
};
