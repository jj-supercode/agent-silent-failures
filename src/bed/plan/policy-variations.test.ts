import { describe, expect, test } from 'vitest';

import {
    abstentionAnswer,
    checkerToolName,
    checkPrompt,
    delegate,
    readSourceToolId,
    researcherToolName,
    searchCorpusToolId,
    type AgentPolicy,
    type Conversation,
    type ToolExchange,
} from '../../harness/index.ts';
import { sourceIdSchema, unitIntervalSchema } from '../../trace/index.ts';
import {
    forRole,
    withAbstentionWording,
    withAnswerWording,
    withDelegationPhrasing,
    withQuestionPhrasing,
    withRefinement,
} from './policy-variations.ts';

const draw = () => unitIntervalSchema.parse(0);

const conversation = (exchanges: readonly ToolExchange[]): Conversation => ({
    question: 'Who wrote it?',
    exchanges,
    assistantTurns: exchanges.length,
    offeredTools: [searchCorpusToolId],
});

const searchExchange = (query: string, output: unknown, failed = false): ToolExchange => ({
    toolName: searchCorpusToolId,
    args: { query },
    output,
    failed,
});

const rows = { hits: [{ chunkId: 'c1', sourceId: 'Treasure Island', score: 0.8, text: 'Text.', citation: 'S1' }] };

/** Searches the question once, then answers with the question it saw. */
const echoPolicy: AgentPolicy = (seen) =>
    seen.exchanges.length === 0
        ? { kind: 'call-tool', toolName: searchCorpusToolId, args: { query: seen.question } }
        : { kind: 'answer', text: seen.question };

describe('withQuestionPhrasing', () => {
    test('the policy sees the rephrased question', () => {
        const policy = withQuestionPhrasing({ name: 'upper', rephrase: (question) => question.toUpperCase() })(
            echoPolicy,
        );
        expect(policy(conversation([]), draw)).toEqual({
            kind: 'call-tool',
            toolName: searchCorpusToolId,
            args: { query: 'WHO WROTE IT?' },
        });
    });
});

describe('withAnswerWording', () => {
    const policy = withAnswerWording({ name: 'prefix', reword: (answer) => `Answer: ${answer}` })(echoPolicy);

    test('rewords the final answer', () => {
        expect(policy(conversation([searchExchange('q', rows)]), draw)).toEqual({
            kind: 'answer',
            text: 'Answer: Who wrote it?',
        });
    });

    test('leaves tool calls alone', () => {
        expect(policy(conversation([]), draw).kind).toBe('call-tool');
    });
});

describe('withRefinement', () => {
    const policy = withRefinement(echoPolicy);

    test('after one search with rows, searches again with the top source added', () => {
        expect(policy(conversation([searchExchange('who wrote it', rows)]), draw)).toEqual({
            kind: 'call-tool',
            toolName: searchCorpusToolId,
            args: { query: 'who wrote it Treasure Island' },
        });
    });

    test('answers after the refinement', () => {
        const turn = policy(conversation([searchExchange('q', rows), searchExchange('q Treasure Island', rows)]), draw);
        expect(turn.kind).toBe('answer');
    });

    test('never refines a failed or empty search', () => {
        expect(policy(conversation([searchExchange('q', rows, true)]), draw).kind).toBe('answer');
        expect(policy(conversation([searchExchange('q', { hits: [] })]), draw).kind).toBe('answer');
    });
});

describe('withAbstentionWording', () => {
    const sentence = "I wasn't able to find any information about this in the documents.";
    const abstaining: AgentPolicy = () => ({ kind: 'answer', text: abstentionAnswer });

    test('replaces the harness abstention sentence', () => {
        expect(withAbstentionWording({ name: 'n4', sentence })(abstaining)(conversation([]), draw)).toEqual({
            kind: 'answer',
            text: sentence,
        });
    });

    test('leaves every other answer alone', () => {
        const policy = withAbstentionWording({ name: 'n4', sentence })(echoPolicy);
        expect(policy(conversation([searchExchange('q', rows)]), draw)).toEqual({
            kind: 'answer',
            text: 'Who wrote it?',
        });
    });
});

describe('withDelegationPhrasing', () => {
    const subject = sourceIdSchema.parse('Treasure Island');
    const suffixed = withDelegationPhrasing({ name: 'suffix', rephrase: (prompt) => `${prompt} Be brief.` });

    test('rephrases a research request', () => {
        const researching: AgentPolicy = () => delegate(researcherToolName, 'Research Treasure Island.');
        expect(suffixed(researching)(conversation([]), draw)).toEqual(
            delegate(researcherToolName, 'Research Treasure Island. Be brief.'),
        );
    });

    test('keeps a check request in the fixed form the checker parses', () => {
        const checking: AgentPolicy = () => delegate(checkerToolName, checkPrompt(subject));
        expect(suffixed(checking)(conversation([]), draw)).toEqual(delegate(checkerToolName, checkPrompt(subject)));
    });
});

describe('forRole', () => {
    const answering: AgentPolicy = () => ({ kind: 'answer', text: 'facts' });
    const shouting = forRole('checker', withAnswerWording({ name: 'upper', reword: (answer) => answer.toUpperCase() }));
    const offered = (tool: ToolExchange['toolName']): Conversation => ({ ...conversation([]), offeredTools: [tool] });

    test('varies only the calls of the named agent', () => {
        expect(shouting(answering)(offered(readSourceToolId), draw)).toEqual({ kind: 'answer', text: 'FACTS' });
        expect(shouting(answering)(offered(researcherToolName), draw)).toEqual({ kind: 'answer', text: 'facts' });
        expect(shouting(answering)(offered(searchCorpusToolId), draw)).toEqual({ kind: 'answer', text: 'facts' });
    });
});
