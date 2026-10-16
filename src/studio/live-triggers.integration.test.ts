import { describe, expect, test } from 'vitest';

import { harnessRunViewOptions } from '../catalog/index.ts';
import { CorpusLoadError, loadQuestions } from '../corpus/index.ts';
import { awaitStoredTrace, createMultiAgentPolicy, ragAgentKey, supervisorKey } from '../harness/index.ts';
import { loadRunView, traceIdSchema, type RunView } from '../trace/index.ts';
import { demonstrationQuestions } from './demonstration/questions.ts';
import type { StudioFaultPreset } from './faults/model.ts';
import { studioFaultPresets } from './faults/presets.ts';
import { scriptedThreadModel } from './scripted-thread-model.ts';
import { startStudioHarness } from './start-studio-harness.ts';

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}
const [question] = demonstrationQuestions(loaded.questions);
if (question === undefined) {
    throw new Error('the corpus holds no held-out question with a supervisor task');
}

/**
 * The live path with the clean scripted agents standing in for Claude: whatever the trace shows was done by the
 * preset's infrastructure, not by a faulty policy.
 */
const liveStandIn = { kind: 'live', model: scriptedThreadModel(createMultiAgentPolicy()) } as const;

const chatView = async (preset: StudioFaultPreset, agent: 'rag' | 'supervisor'): Promise<RunView> => {
    await using harness = await startStudioHarness({ model: liveStandIn, preset });
    const result = await harness.mastra
        .getAgent(agent === 'rag' ? ragAgentKey : supervisorKey)
        .generate(agent === 'rag' ? question.question.question : question.supervisorMessage);
    const traceId = traceIdSchema.parse(result.traceId);
    expect(await awaitStoredTrace(harness.mastra, traceId)).toBe(true);
    const view = await loadRunView(harness.mastra, traceId, harnessRunViewOptions);
    if (view.kind !== 'loaded') {
        throw new Error(`the run view did not load: ${view.kind}`);
    }
    return view.view;
};

describe('live triggers, under a cleanly behaving stand-in model', () => {
    test('worker-reply-dropped: the supervisor reads, and the trace records, an empty reply from every worker', async () => {
        const view = await chatView(studioFaultPresets['worker-reply-dropped'], 'supervisor');
        expect(view.delegations.length).toBeGreaterThan(0);
        expect(
            view.delegations.map((delegation) => (delegation.reply.kind === 'replied' ? delegation.reply.text : null)),
        ).toEqual(view.delegations.map(() => ''));
    });

    test('search-drops-results: every search the agent ran came back with no rows and no error', async () => {
        const view = await chatView(studioFaultPresets['search-drops-results'], 'rag');
        expect(view.retrievals.length).toBeGreaterThan(0);
        expect(view.retrievals.map((retrieval) => retrieval.retrieved)).toEqual(
            view.retrievals.map(() => ({ kind: 'rows', hits: [], truncatedItems: 0 })),
        );
    });
});
