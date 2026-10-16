import { z } from 'zod';

import {
    abstentionAnswer,
    agentRoleOf,
    researcherToolName,
    searchCorpusArgsSchema,
    searchCorpusHitsSchema,
    searchCorpusToolId,
    searchTurn,
    type AgentPolicy,
    type AgentRole,
} from '../../harness/index.ts';

export type QuestionPhrasing = { readonly name: string; readonly rephrase: (question: string) => string };
export type AnswerWording = { readonly name: string; readonly reword: (answer: string) => string };
export type AbstentionWording = { readonly name: string; readonly sentence: string };
export type DelegationPhrasing = { readonly name: string; readonly rephrase: (prompt: string) => string };

/** A change to a policy's behaviour; variations compose by plain function application. */
export type PolicyVariation = (policy: AgentPolicy) => AgentPolicy;

/** The policy sees the question in another phrasing, so every query it derives from the question changes too. */
export const withQuestionPhrasing =
    ({ rephrase }: QuestionPhrasing): PolicyVariation =>
    (policy) =>
    (conversation, draw) =>
        policy({ ...conversation, question: rephrase(conversation.question) }, draw);

/** The final answer, whatever the policy wrote, in another wording; tool calls are untouched. */
export const withAnswerWording =
    ({ reword }: AnswerWording): PolicyVariation =>
    (policy) =>
    (conversation, draw) => {
        const turn = policy(conversation, draw);
        return turn.kind === 'answer' ? { kind: 'answer', text: reword(turn.text) } : turn;
    };

/** The harness abstention sentence in another wording; every other answer is untouched. */
export const withAbstentionWording =
    ({ sentence }: AbstentionWording): PolicyVariation =>
    (policy) =>
    (conversation, draw) => {
        const turn = policy(conversation, draw);
        return turn.kind === 'answer' && turn.text === abstentionAnswer ? { kind: 'answer', text: sentence } : turn;
    };

const delegationArgsSchema = z.object({ prompt: z.string() });

/** Every research request the supervisor sends, in another phrasing; check requests keep their fixed form. */
export const withDelegationPhrasing =
    ({ rephrase }: DelegationPhrasing): PolicyVariation =>
    (policy) =>
    (conversation, draw) => {
        const turn = policy(conversation, draw);
        const prompt =
            turn.kind === 'call-tool' && turn.toolName === researcherToolName
                ? delegationArgsSchema.safeParse(turn.args).data?.prompt
                : undefined;
        return turn.kind === 'call-tool' && prompt !== undefined
            ? { ...turn, args: { ...turn.args, prompt: rephrase(prompt) } }
            : turn;
    };

/** Applies `variation` only to the model calls of one agent of the multi-agent harness. */
export const forRole =
    (role: AgentRole, variation: PolicyVariation): PolicyVariation =>
    (policy) => {
        const varied = variation(policy);
        return (conversation, draw) => (agentRoleOf(conversation) === role ? varied : policy)(conversation, draw);
    };

/**
 * Search, then refine once: when the policy would answer right after one successful search that returned rows, it
 * first searches again with the top row's source added to the query. A legitimate second call (a tool-loop hard
 * negative); the policy then answers from the refined rows.
 */
export const withRefinement: PolicyVariation = (policy) => (conversation, draw) => {
    const turn = policy(conversation, draw);
    const searches = conversation.exchanges.filter((exchange) => exchange.toolName === searchCorpusToolId);
    const [onlySearch, ...laterSearches] = searches;
    if (turn.kind !== 'answer' || onlySearch === undefined || laterSearches.length > 0 || onlySearch.failed) {
        return turn;
    }
    const topSource = searchCorpusHitsSchema.safeParse(onlySearch.output).data?.hits[0]?.sourceId;
    const query = searchCorpusArgsSchema.safeParse(onlySearch.args).data?.query;
    return topSource === undefined || query === undefined ? turn : searchTurn(`${query} ${topSource}`);
};
