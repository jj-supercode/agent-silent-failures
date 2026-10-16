import { scoreTraceBatch } from '@mastra/core/evals/scoreTraces';
import { describe, expect, test } from 'vitest';

import { harnessRunViewOptions } from '../../catalog/retrieval-tools.ts';
import { CorpusLoadError, loadQuestions, toSourceDocuments, type CorpusQuestion } from '../../corpus/index.ts';
import { createHarness, defaultHarnessConfig, type Harness, type HarnessConfig } from '../../harness/index.ts';
import { loadRunView, type TraceId } from '../../trace/index.ts';
import { defineEmptyRetrievalAnsweredEntry } from './entry.ts';
import { emptyRetrievalAbstainedHardNegative, emptyRetrievalAnsweredFault } from './fault.ts';
import { createEmptyRetrievalAnsweredScorer } from './scorer.ts';

const questionsUnderTest = 2;
const smokeSeeds = [0, 1, 2] as const;
const options = { runViewOptions: harnessRunViewOptions, extraAbstentionPatterns: [] };
const entry = defineEmptyRetrievalAnsweredEntry(options);
const scorer = createEmptyRetrievalAnsweredScorer(options);

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}
const questions: readonly CorpusQuestion[] = loaded.questions.slice(0, questionsUnderTest);

const withHarness = async <T>(config: HarnessConfig, use: (harness: Harness) => Promise<T>): Promise<T> => {
    const created = await createHarness({
        config,
        documents: toSourceDocuments(questions),
        scorers: { [entry.id]: scorer },
    });
    if (created.kind === 'failed') {
        throw new Error(JSON.stringify(created.failure));
    }
    await using harness = created.harness;
    return await use(harness);
};

const runTraces = async (harness: Harness): Promise<readonly TraceId[]> =>
    Array.fromAsync(
        smokeSeeds.flatMap((seed) => questions.map((question) => ({ question, seed }))),
        async (request) => {
            const outcome = await harness.runScenario(request);
            if (outcome.kind === 'failed') {
                throw new Error(outcome.reason);
            }
            return outcome.run.traceId;
        },
    );

const verdictKinds = async (harness: Harness): Promise<readonly string[]> =>
    Array.fromAsync(await runTraces(harness), async (traceId) => {
        const view = await loadRunView(harness.mastra, traceId, harnessRunViewOptions);
        return view.kind === 'loaded' ? entry.detect(view.view).kind : view.kind;
    });

const runCount = smokeSeeds.length * questionsUnderTest;

describe('empty-retrieval-answered on the offline stack (real Mastra, fastembed, LibSQL)', () => {
    test('stays clear on every clean run', async () => {
        expect(await withHarness(defaultHarnessConfig, verdictKinds)).toEqual(Array(runCount).fill('clear'));
    });

    test.each(emptyRetrievalAnsweredFault.variants.map((variant) => [variant.severity, variant] as const))(
        'fires on every run when retrieval is emptied by %s and the model answers from memory',
        async (_severity, variant) => {
            expect(await withHarness(variant.apply(defaultHarnessConfig), verdictKinds)).toEqual(
                Array(runCount).fill('fired'),
            );
        },
    );

    test.each(emptyRetrievalAbstainedHardNegative.variants.map((variant) => [variant.severity, variant] as const))(
        'stays clear when retrieval is emptied by %s and the agent abstains (hard negative)',
        async (_severity, variant) => {
            expect(await withHarness(variant.apply(defaultHarnessConfig), verdictKinds)).toEqual(
                Array(runCount).fill('clear'),
            );
        },
    );

    test('scores 1 on a faulted trace and 0 on a clean one through Mastra trace scoring', async () => {
        const scoredValue = async (config: HarnessConfig) =>
            withHarness(config, async (harness) => {
                const [traceId] = await runTraces(harness);
                const storage = harness.mastra.getStorage();
                if (traceId === undefined || storage === undefined) {
                    throw new Error('no trace or no storage');
                }
                const batch = await scoreTraceBatch({ storage, scorer, targets: [{ traceId }] });
                return batch.results.map((result) => ('score' in result ? result.score.score : null));
            });
        const [faulted] = emptyRetrievalAnsweredFault.variants;
        expect(await scoredValue(faulted.apply(defaultHarnessConfig))).toEqual([1]);
        expect(await scoredValue(defaultHarnessConfig)).toEqual([0]);
    });
});
