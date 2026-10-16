import type { Mastra } from '@mastra/core/mastra';

import type { CorpusQuestion } from '../corpus/index.ts';
import { traceIdSchema, type TraceId } from '../trace/index.ts';
import { ragAgentKey } from './rag-agent.ts';
import { toRequestContext, type ScenarioContext } from './scenario.ts';
import { awaitStoredTrace } from './stored-trace.ts';

export type ScenarioRequest = {
    readonly question: Pick<CorpusQuestion, 'id' | 'question'>;
    readonly seed: number;
};

export type ScenarioRun = {
    readonly traceId: TraceId;
    readonly scenario: ScenarioContext;
    readonly answerText: string;
};

export type ScenarioOutcome =
    | { readonly kind: 'completed'; readonly run: ScenarioRun }
    | { readonly kind: 'failed'; readonly scenario: ScenarioContext; readonly reason: string };

/**
 * Runs the RAG agent on one question under a seeded scenario and returns once its trace is stored and readable.
 * The step budget comes from the agent's `defaultOptions`, the same one Studio uses.
 */
export const createScenarioRunner =
    (mastra: Mastra) =>
    async ({ question, seed }: ScenarioRequest): Promise<ScenarioOutcome> => {
        const scenario: ScenarioContext = { questionId: question.id, seed };
        const result = await mastra
            .getAgent(ragAgentKey)
            .generate(question.question, { requestContext: toRequestContext(scenario) });
        const traceId = traceIdSchema.safeParse(result.traceId);
        if (!traceId.success) {
            return { kind: 'failed', scenario, reason: 'the agent run returned no trace id' };
        }
        return (await awaitStoredTrace(mastra, traceId.data))
            ? { kind: 'completed', run: { traceId: traceId.data, scenario, answerText: result.text } }
            : { kind: 'failed', scenario, reason: `trace ${traceId.data} never reached storage` };
    };
