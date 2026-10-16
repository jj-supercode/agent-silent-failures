import { scoreTraceBatch } from '@mastra/core/evals/scoreTraces';
import { describe, expect, test } from 'vitest';

import {
    CorpusLoadError,
    loadQuestions,
    toQuestionDocuments,
    toSourceDocuments,
    type CorpusQuestion,
    type SourceDocument,
} from '../../corpus/index.ts';
import {
    createHarness,
    defaultHarnessConfig,
    mastraDefaultChunking,
    withSettings,
    type Harness,
    type HarnessConfig,
} from '../../harness/index.ts';
import { loadIngestionView } from '../../trace/index.ts';
import type { Verdict } from '../contract.ts';
import { embeddingCoverageEntry } from './entry.ts';
import { defaultChunkSizeFault, embedBatchCapFault, zeroVectorsFault } from './fault.ts';
import { embeddingCoverageScorer } from './scorer.ts';

const questionsUnderTest = 4;

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}
const questions: readonly CorpusQuestion[] = loaded.questions.slice(0, questionsUnderTest);
const paragraphDocuments = toSourceDocuments(questions);
const questionDocuments = toQuestionDocuments(questions);

const withHarness = async <T>(
    config: HarnessConfig,
    documents: readonly SourceDocument[],
    use: (harness: Harness) => Promise<T>,
): Promise<T> => {
    const created = await createHarness({
        config,
        documents,
        scorers: { [embeddingCoverageEntry.id]: embeddingCoverageScorer },
    });
    if (created.kind === 'failed') {
        throw new Error(JSON.stringify(created.failure));
    }
    await using harness = created.harness;
    return await use(harness);
};

const ingestionVerdict = (config: HarnessConfig, documents: readonly SourceDocument[]): Promise<Verdict['kind']> =>
    withHarness(config, documents, async (harness) => {
        const view = await loadIngestionView(harness.mastra, harness.ingestion.traceId);
        if (view.kind !== 'loaded') {
            throw new Error(`ingestion view: ${view.kind}`);
        }
        return embeddingCoverageEntry.detect(view.view).kind;
    });

const mastraDefaults = withSettings(defaultHarnessConfig, { chunking: mastraDefaultChunking });

describe('embedding-coverage on the offline stack (real Mastra, fastembed, LibSQL)', () => {
    test('stays clear on the clean configuration', async () => {
        expect(await ingestionVerdict(defaultHarnessConfig, paragraphDocuments)).toBe('clear');
    });

    test('stays clear on Mastra defaults over short, per-paragraph documents (hard negative)', async () => {
        expect(await ingestionVerdict(mastraDefaults, paragraphDocuments)).toBe('clear');
    });

    test('stays clear on clean chunking over long, question-level documents (hard negative)', async () => {
        expect(await ingestionVerdict(defaultHarnessConfig, questionDocuments)).toBe('clear');
    });

    test.each(defaultChunkSizeFault.variants.map((variant) => [variant.severity, variant] as const))(
        'fires on %s over long, question-level documents',
        async (_severity, variant) => {
            expect(await ingestionVerdict(variant.apply(defaultHarnessConfig), questionDocuments)).toBe('fired');
        },
    );

    test.each(
        [...embedBatchCapFault.variants, ...zeroVectorsFault.variants].map(
            (variant) => [variant.severity, variant] as const,
        ),
    )('fires under %s', async (_severity, variant) => {
        expect(await ingestionVerdict(variant.apply(defaultHarnessConfig), paragraphDocuments)).toBe('fired');
    });

    test('scores the ingestion trace 1 under Mastra defaults and 0 when clean, through Mastra trace scoring', async () => {
        const scoredValue = (config: HarnessConfig) =>
            withHarness(config, questionDocuments, async (harness) => {
                const storage = harness.mastra.getStorage();
                if (storage === undefined) {
                    throw new Error('no storage');
                }
                const batch = await scoreTraceBatch({
                    storage,
                    scorer: embeddingCoverageScorer,
                    targets: [{ traceId: harness.ingestion.traceId }],
                });
                return batch.results.map((result) => ('score' in result ? result.score.score : null));
            });
        expect(await scoredValue(mastraDefaults)).toEqual([1]);
        expect(await scoredValue(defaultHarnessConfig)).toEqual([0]);
    });
});
