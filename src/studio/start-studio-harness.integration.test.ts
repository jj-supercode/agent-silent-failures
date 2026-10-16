import { describe, expect, test } from 'vitest';

import { catalogEntries } from '../catalog/index.ts';
import { answerFromHitsPolicy, ragAgentKey, type MultiAgentHarness } from '../harness/index.ts';
import { usdSchema } from '../live/budget/model.ts';
import { guardStudioModel } from '../live/studio/studio-budget.ts';
import type { StudioSpend } from '../live/studio/studio-spend.ts';
import { scriptedThreadModel } from './scripted-thread-model.ts';
import { startStudioHarness } from './start-studio-harness.ts';
import { studioHistoryMessages } from './studio-memory.ts';

const firstQuestion = 'Which genus has more species, Monstera or Cercis?';
const secondQuestion = 'Who died first, George Archainbaud or Ralph Murphy?';
const thread = { thread: 'studio-thread', resource: 'studio-visitor' };
/** The scripted policy searches once and answers: two model calls per question. */
const callsPerQuestion = 2;

const ask = async (harness: MultiAgentHarness, question: string): Promise<string> =>
    (await harness.mastra.getAgent(ragAgentKey).generate(question, { memory: thread })).text;

const threadUserTexts = async (harness: MultiAgentHarness): Promise<readonly string[]> => {
    const memory = await harness.mastra.getAgent(ragAgentKey).getMemory();
    const recalled = await memory?.recall({ threadId: thread.thread, resourceId: thread.resource });
    return (recalled?.messages ?? [])
        .filter((message) => message.role === 'user')
        .flatMap((message) => message.content.parts.flatMap((part) => (part.type === 'text' ? [part.text] : [])));
};

describe('startStudioHarness', () => {
    test('the key-free project keeps a thread: a follow-up question is answered on its own and stored with the first', async () => {
        await using harness = await startStudioHarness({ model: { kind: 'scripted' }, preset: null });
        const firstAnswer = await ask(harness, firstQuestion);
        const secondAnswer = await ask(harness, secondQuestion);
        expect(firstAnswer).toMatch(/\[S\d+\]/);
        expect(secondAnswer).toMatch(/\[S\d+\]/);
        expect(secondAnswer).not.toBe(firstAnswer);
        expect(await threadUserTexts(harness)).toEqual([firstQuestion, secondQuestion]);
        const memory = await harness.mastra.getAgent(ragAgentKey).getMemory();
        expect(memory?.getMergedThreadConfig().lastMessages).toBe(studioHistoryMessages);
    });

    test('registers one scorer per catalog entry', async () => {
        await using harness = await startStudioHarness({ model: { kind: 'scripted' }, preset: null });
        expect(Object.keys(harness.mastra.listScorers() ?? {}).toSorted()).toEqual(
            catalogEntries.map((entry) => entry.id).toSorted(),
        );
    });

    test('the live project wiring: the guarded model answers in Studio and reports every call', async () => {
        const reports: StudioSpend[] = [];
        const guarded = guardStudioModel(scriptedThreadModel(answerFromHitsPolicy), {
            cap: usdSchema.parse(1),
            onSpend: (spend) => reports.push(spend),
        });
        await using harness = await startStudioHarness({ model: { kind: 'live', model: guarded }, preset: null });
        expect(await ask(harness, firstQuestion)).toMatch(/\[S\d+\]/);
        expect(await ask(harness, secondQuestion)).toMatch(/\[S\d+\]/);
        expect(reports.map((report) => report.spend.callCount)).toEqual(
            Array.from({ length: 2 * callsPerQuestion }, (_, index) => index + 1),
        );
        expect(reports.every((report) => !report.capReached)).toBe(true);
    });
});
