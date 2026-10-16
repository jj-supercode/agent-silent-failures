import { describe, expect, test } from 'vitest';

import { CorpusLoadError, loadQuestions, toSourceDocuments } from '../../corpus/index.ts';
import {
    defaultHarnessConfig,
    defaultMultiAgentConfig,
    readSourceToolId,
    scoreStoredTrace,
    withMultiAgentRuns,
    withSingleAgentRuns,
    withTransientSearchError,
    type HarnessConfig,
    type ViewedRun,
} from '../../harness/index.ts';
import { toolLoopEntry } from './entry.ts';
import { repeatedSearchFault } from './fault.ts';
import { toolLoopThresholds } from './model.ts';
import { toolLoopScorer } from './scorer.ts';

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
    scorers: { [toolLoopEntry.id]: toolLoopScorer },
});

const verdictKinds = (runs: readonly ViewedRun[]) => runs.map((run) => toolLoopEntry.detect(run.view).kind);

const pagesRead = (run: ViewedRun) => run.view.toolCalls.filter((call) => call.toolName === readSourceToolId).length;

describe('tool-loop on the offline stack (real Mastra, fastembed, LibSQL)', () => {
    test('stays clear on every clean single-agent run', async () => {
        expect(await withSingleAgentRuns(request(defaultHarnessConfig), verdictKinds)).toEqual(
            Array(runCount).fill('clear'),
        );
    });

    test('stays clear on a legitimate retry after a transient search error', async () => {
        expect(
            await withSingleAgentRuns(request(withTransientSearchError(defaultHarnessConfig)), verdictKinds),
        ).toEqual(Array(runCount).fill('clear'));
    });

    test('stays clear on multi-agent runs whose checker pages through a source', async () => {
        const { kinds, mostPages } = await withMultiAgentRuns(request(defaultMultiAgentConfig), (runs) => ({
            kinds: verdictKinds(runs),
            mostPages: Math.max(...runs.map(pagesRead)),
        }));
        expect(kinds).toEqual(Array(runCount).fill('clear'));
        expect(mostPages).toBeGreaterThanOrEqual(toolLoopThresholds.MIN_REPEATS.value);
    });

    test.each(repeatedSearchFault.variants.map((variant) => [variant.severity, variant] as const))(
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
                run === undefined ? null : scoreStoredTrace(run, toolLoopScorer),
            );
        const [faulted] = repeatedSearchFault.variants;
        expect(await firstScore(faulted.apply(defaultHarnessConfig))).toBe(1);
        expect(await firstScore(defaultHarnessConfig)).toBe(0);
    });
});
