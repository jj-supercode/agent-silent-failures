import { describe, expect, test } from 'vitest';

import { searchCorpusToolId } from '../../search/search-corpus-tool.ts';
import type { Conversation, Draw, ToolExchange } from '../../policy/model.ts';
import { abstentionAnswer } from '../../policy/answer-from-hits.ts';
import { sourceIdSchema, unitIntervalSchema, type ToolName } from '../../../trace/index.ts';
import { checkPrompt } from '../delegation-prompts.ts';
import { checkerToolName, researcherToolName, type SupervisorTask } from '../model.ts';
import { readSourceToolId } from '../read-source-tool.ts';
import { renderTaskMessage } from '../task-message.ts';
import { maxCheckedPages } from './checker-policy.ts';
import { checkShare } from './clean-supervisor-policy.ts';
import { createMultiAgentPolicy } from './multi-agent-policy.ts';
import { questionIdSchema } from '../../../corpus/index.ts';

const [derrickson, wood] = [sourceIdSchema.parse('Scott Derrickson'), sourceIdSchema.parse('Ed Wood')];
const task: SupervisorTask = {
    questionId: questionIdSchema.parse('q-compare'),
    question: 'Were Scott Derrickson and Ed Wood of the same nationality?',
    subjects: [derrickson, wood],
};

/** Always draws `value`: below `checkShare` the supervisor checks, at or above it it answers. */
const drawing =
    (value: number): Draw =>
    () =>
        unitIntervalSchema.parse(value);
const neverChecks = drawing(checkShare);
const alwaysChecks = drawing(0);

const reply = (toolName: ToolName, prompt: string, text: string): ToolExchange => ({
    toolName,
    args: { prompt },
    output: { text },
    failed: false,
});

const supervisorConversation = (exchanges: readonly ToolExchange[]): Conversation => ({
    question: renderTaskMessage(task),
    exchanges,
    assistantTurns: exchanges.length,
    offeredTools: [researcherToolName, checkerToolName],
});

const policy = createMultiAgentPolicy();

const synthesisedFrom = (exchanges: readonly ToolExchange[]): string => {
    const turn = policy({ ...supervisorConversation(exchanges), question: 'no brief' }, neverChecks);
    return turn.kind === 'answer' ? turn.text : '';
};

const promptOf = (turn: ReturnType<typeof policy>): string =>
    turn.kind === 'call-tool' && typeof turn.args['prompt'] === 'string' ? turn.args['prompt'] : '';

describe('clean supervisor', () => {
    test('researches each subject once, then answers from the replies', () => {
        const first = policy(supervisorConversation([]), neverChecks);
        const firstReply = reply(researcherToolName, promptOf(first), 'Scott Derrickson is American.');
        const second = policy(supervisorConversation([firstReply]), neverChecks);
        const secondReply = reply(researcherToolName, promptOf(second), 'Ed Wood was American.');
        const answer = policy(supervisorConversation([firstReply, secondReply]), neverChecks);
        expect([promptOf(first), promptOf(second)].toSorted()).toEqual(
            [derrickson, wood].map((subject) => `Research ${subject} and report the key facts.`).toSorted(),
        );
        expect(answer).toEqual({ kind: 'answer', text: 'Scott Derrickson is American. Ed Wood was American.' });
    });

    test('re-delegates once, reworded, when a reply abstains', () => {
        const prompt = `Find what the corpus says about ${derrickson}.`;
        const abstained = reply(researcherToolName, prompt, abstentionAnswer);
        expect(promptOf(policy(supervisorConversation([abstained]), neverChecks))).toBe(
            `Please ${prompt.charAt(0).toLowerCase()}${prompt.slice(1)}`,
        );
        const retried = reply(researcherToolName, `Please ${prompt}`, abstentionAnswer);
        expect(promptOf(policy(supervisorConversation([abstained, retried]), neverChecks))).toContain('Ed Wood');
    });

    test('answers from the usable replies only, and abstains when no reply is usable', () => {
        const abstained = reply(researcherToolName, `Please research ${derrickson}.`, abstentionAnswer);
        const researchedWood = reply(
            researcherToolName,
            `Research ${wood} and report the key facts.`,
            'Ed Wood was American.',
        );
        expect(synthesisedFrom([abstained, researchedWood])).toBe('Ed Wood was American.');
        expect(synthesisedFrom([abstained, abstained])).toBe(abstentionAnswer);
    });

    test('asks the checker to read the second subject when the draw says so', () => {
        const researched = [
            reply(
                researcherToolName,
                `Find what the corpus says about ${derrickson}.`,
                'Scott Derrickson is American.',
            ),
            reply(researcherToolName, `Find what the corpus says about ${wood}.`, 'Ed Wood was American.'),
        ];
        expect(policy(supervisorConversation(researched), alwaysChecks)).toEqual({
            kind: 'call-tool',
            toolName: checkerToolName,
            args: { prompt: checkPrompt(wood) },
        });
    });
});

describe('clean supervisor without a task brief (a Studio chat message)', () => {
    const chat = (exchanges: readonly ToolExchange[]): Conversation => ({
        ...supervisorConversation(exchanges),
        question: 'Who directed Plan 9 from Outer Space?',
    });

    test('hands the whole message to the researcher once, then answers from the reply', () => {
        expect(promptOf(policy(chat([]), neverChecks))).toBe('Who directed Plan 9 from Outer Space?');
        const replied = reply(researcherToolName, 'Who directed Plan 9 from Outer Space?', 'Ed Wood directed it.');
        expect(policy(chat([replied]), neverChecks)).toEqual({ kind: 'answer', text: 'Ed Wood directed it.' });
    });
});

describe('checker', () => {
    const checkerConversation = (pages: readonly { page: number; hasMore: boolean }[]): Conversation => ({
        question: checkPrompt(wood),
        exchanges: pages.map(({ page, hasMore }) => ({
            toolName: readSourceToolId,
            args: { sourceId: wood, page },
            output: { sourceId: wood, page, text: `Page ${page}.`, hasMore },
            failed: false,
        })),
        assistantTurns: pages.length,
        offeredTools: [readSourceToolId],
    });

    test('reads the next page while more follow', () => {
        expect(policy(checkerConversation([{ page: 1, hasMore: true }]), neverChecks)).toEqual({
            kind: 'call-tool',
            toolName: readSourceToolId,
            args: { sourceId: wood, page: 2 },
        });
    });

    test(`stops at ${maxCheckedPages} pages and reports what it read`, () => {
        const pages = Array.from({ length: maxCheckedPages }, (_, index) => ({ page: index + 1, hasMore: true }));
        expect(policy(checkerConversation(pages), neverChecks)).toEqual({
            kind: 'answer',
            text: 'Page 1. Page 2. Page 3.',
        });
    });
});

describe('role routing', () => {
    test('an agent offered only the search tool is the researcher', () => {
        const turn = policy(
            {
                question: 'Find what the corpus says about Ed Wood.',
                exchanges: [],
                assistantTurns: 0,
                offeredTools: [searchCorpusToolId],
            },
            neverChecks,
        );
        expect(turn.kind === 'call-tool' ? turn.toolName : null).toBe(searchCorpusToolId);
    });

    test('an override replaces one role and leaves the others clean', () => {
        const overridden = createMultiAgentPolicy({ checker: () => ({ kind: 'answer', text: 'skipped' }) });
        expect(overridden(supervisorConversation([]), neverChecks).kind).toBe('call-tool');
    });
});
