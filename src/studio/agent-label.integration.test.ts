import { describe, expect, test } from 'vitest';

import { CorpusLoadError, loadQuestions, toSourceDocuments } from '../corpus/index.ts';
import { harnessRunViewOptions } from '../catalog/index.ts';
import {
    createMultiAgentHarness,
    defaultMultiAgentConfig,
    toSupervisorTask,
    type AgentLabel,
} from '../harness/index.ts';
import { loadRunView, type RunView } from '../trace/index.ts';
import { demonstrationQuestions } from './demonstration/questions.ts';

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}
const [question] = demonstrationQuestions(loaded.questions);
const task = question === undefined ? null : toSupervisorTask(question.question);
if (question === undefined || task === null) {
    throw new Error('the corpus holds no held-out question with a supervisor task');
}
const documents = toSourceDocuments([question.question]);

/** One seeded supervisor run on the scripted multi-agent harness, with or without a Studio label. */
const supervisedRunView = async (agentLabel: AgentLabel | null): Promise<RunView> => {
    const created = await createMultiAgentHarness({
        config: defaultMultiAgentConfig,
        documents,
        ...(agentLabel === null ? {} : { agentLabel }),
    });
    if (created.kind === 'failed') {
        throw new Error(JSON.stringify(created.failure));
    }
    await using harness = created.harness;
    const outcome = await harness.runTask({ task, seed: 0 });
    if (outcome.kind === 'failed') {
        throw new Error(outcome.reason);
    }
    const view = await loadRunView(harness.mastra, outcome.run.traceId, harnessRunViewOptions);
    if (view.kind !== 'loaded') {
        throw new Error(`the run view did not load: ${view.kind}`);
    }
    return view.view;
};

/** What the multi-agent detectors read of a delegation, without the ids every run draws afresh. */
const delegationContent = (view: RunView) =>
    view.delegations.map(({ workerName, toolName, prompt, reply }) => ({ workerName, toolName, prompt, reply }));

describe('the Studio agent label', () => {
    test('a labelled run yields the same delegations and agent runs as an unlabelled one', async () => {
        const unlabelled = await supervisedRunView(null);
        const labelled = await supervisedRunView('FAULT worker-reply-dropped');
        expect(unlabelled.delegations.length).toBeGreaterThan(0);
        expect(delegationContent(labelled)).toEqual(delegationContent(unlabelled));
        expect(labelled.agentRuns.map((run) => run.agentId)).toEqual(unlabelled.agentRuns.map((run) => run.agentId));
    });
});
