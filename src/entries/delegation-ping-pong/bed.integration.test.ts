import { describe, expect, test } from 'vitest';

import { CorpusLoadError, loadQuestions, toSourceDocuments } from '../../corpus/index.ts';
import {
    defaultHarnessConfig,
    defaultMultiAgentConfig,
    scoreStoredTrace,
    withMultiAgentRuns,
    withSearchOutage,
    withSingleAgentRuns,
    withTransientSearchError,
    type HarnessConfig,
    type ViewedRun,
} from '../../harness/index.ts';
import { delegationPingPongEntry } from './entry.ts';
import { supervisorNoAckFault } from './fault.ts';
import { delegationPingPongScorer } from './scorer.ts';

const smokeSeeds = [0, 1, 2];
const questionsUnderTest = 2;

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}
const questions = loaded.questions.slice(0, questionsUnderTest);
const runCount = smokeSeeds.length * questions.length;

const request = (config: HarnessConfig) => ({
    config,
    documents: toSourceDocuments(questions),
    questions,
    seeds: smokeSeeds,
    scorers: { [delegationPingPongEntry.id]: delegationPingPongScorer },
});

const verdictKinds = (runs: readonly ViewedRun[]) => runs.map((run) => delegationPingPongEntry.detect(run.view).kind);

describe('delegation-ping-pong on the offline stack (real Mastra, fastembed, LibSQL)', () => {
    test.each([
        ['clean: two subjects to the same researcher, sometimes a check', defaultMultiAgentConfig],
        ['a transient search error inside the workers', withTransientSearchError(defaultMultiAgentConfig)],
        ['a search outage: one legitimate re-delegation per subject', withSearchOutage(defaultMultiAgentConfig)],
    ])('stays clear on every multi-agent run with %s', async (_label, config) => {
        expect(await withMultiAgentRuns(request(config), verdictKinds)).toEqual(Array(runCount).fill('clear'));
    });

    test('is not applicable to single-agent runs', async () => {
        expect(await withSingleAgentRuns(request(defaultHarnessConfig), verdictKinds)).toEqual(
            Array(runCount).fill('not-applicable'),
        );
    });

    test.each(supervisorNoAckFault.variants.map((variant) => [variant.severity, variant] as const))(
        'fires on every run under %s',
        async (_severity, variant) => {
            expect(await withMultiAgentRuns(request(variant.apply(defaultMultiAgentConfig)), verdictKinds)).toEqual(
                Array(runCount).fill('fired'),
            );
        },
    );

    test('scores 1 on a faulted trace and 0 on a clean one through Mastra trace scoring', async () => {
        const firstScore = (config: HarnessConfig) =>
            withMultiAgentRuns({ ...request(config), seeds: [0] }, ([run]) =>
                run === undefined ? null : scoreStoredTrace(run, delegationPingPongScorer),
            );
        const [faulted] = supervisorNoAckFault.variants;
        expect(await firstScore(faulted.apply(defaultMultiAgentConfig))).toBe(1);
        expect(await firstScore(defaultMultiAgentConfig)).toBe(0);
    });
});
