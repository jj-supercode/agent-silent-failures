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
import { swallowedToolErrorEntry } from './entry.ts';
import { swallowedSearchErrorFault } from './fault.ts';
import { swallowedToolErrorScorer } from './scorer.ts';

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
    scorers: { [swallowedToolErrorEntry.id]: swallowedToolErrorScorer },
});

const verdictKinds = (runs: readonly ViewedRun[]) => runs.map((run) => swallowedToolErrorEntry.detect(run.view).kind);

const cleanConfigs = [
    ['clean', defaultHarnessConfig, defaultMultiAgentConfig],
    [
        'a transient search error the agent retries',
        withTransientSearchError(defaultHarnessConfig),
        withTransientSearchError(defaultMultiAgentConfig),
    ],
    [
        'a search outage the agent abstains on',
        withSearchOutage(defaultHarnessConfig),
        withSearchOutage(defaultMultiAgentConfig),
    ],
] as const;

describe('swallowed-tool-error on the offline stack (real Mastra, fastembed, LibSQL)', () => {
    test.each(cleanConfigs)('stays clear on every single-agent run with %s', async (_label, config) => {
        expect(await withSingleAgentRuns(request(config), verdictKinds)).toEqual(Array(runCount).fill('clear'));
    });

    test.each(cleanConfigs)('stays clear on every multi-agent run with %s', async (_label, _single, config) => {
        expect(await withMultiAgentRuns(request(config), verdictKinds)).toEqual(Array(runCount).fill('clear'));
    });

    test.each(swallowedSearchErrorFault.variants.map((variant) => [variant.severity, variant] as const))(
        'fires on every run under %s',
        async (_severity, variant) => {
            expect(await withSingleAgentRuns(request(variant.apply(defaultHarnessConfig)), verdictKinds)).toEqual(
                Array(runCount).fill('fired'),
            );
        },
    );

    test('scores 1 on a faulted trace and 0 on a clean one through Mastra trace scoring', async () => {
        const firstScore = (config: HarnessConfig) =>
            withSingleAgentRuns({ ...request(config), seeds: [0] }, ([run]) =>
                run === undefined ? null : scoreStoredTrace(run, swallowedToolErrorScorer),
            );
        const [faulted] = swallowedSearchErrorFault.variants;
        expect(await firstScore(faulted.apply(defaultHarnessConfig))).toBe(1);
        expect(await firstScore(defaultHarnessConfig)).toBe(0);
    });
});
