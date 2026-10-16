import { describe, expect, test } from 'vitest';

import {
    CorpusLoadError,
    loadQuestions,
    toQuestionDocuments,
    toSourceDocuments,
    type SourceDocument,
} from '../../corpus/index.ts';
import {
    defaultHarnessConfig,
    mastraDefaultChunking,
    withEmbedderWrapper,
    withSettings,
    type HarnessConfig,
} from '../config.ts';
import type { EmbedderWrapper } from '../embedder/model.ts';
import { createHarness } from '../harness.ts';
import type { ObservedIngestion } from './observed-ingestion.ts';

const questionsUnderTest = 3;

const loadedQuestions = async () => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        throw new CorpusLoadError(loaded.failure);
    }
    return loaded.questions.slice(0, questionsUnderTest);
};

/** Ingests `documents` under `config` and returns what the harness observed of it. */
const observe = async (config: HarnessConfig, documents: readonly SourceDocument[]): Promise<ObservedIngestion> => {
    const created = await createHarness({ config, documents });
    if (created.kind === 'failed') {
        throw new Error(JSON.stringify(created.failure));
    }
    await using harness = created.harness;
    return harness.observedIngestion;
};

/** Replaces the first vector with zeros, as a failed embedding call filled in with a zero vector would. */
const zeroFirstVector: EmbedderWrapper = (embedder) => ({
    ...embedder,
    embedDocuments: async (texts) =>
        (await embedder.embedDocuments(texts)).map((vector, index) => (index === 0 ? vector.map(() => 0) : vector)),
});

/** Returns one vector fewer than it was given texts, without an error. */
const dropLastVector: EmbedderWrapper = (embedder) => ({
    ...embedder,
    embedDocuments: async (texts) => (await embedder.embedDocuments(texts)).slice(0, -1),
});

describe('observeIngestion (real fastembed and LibSQL; measured apart from the ingestion report)', () => {
    test('default chunks over long documents: every chunk over the window embeds like its head', async () => {
        const questions = await loadedQuestions();
        const observed = await observe(
            withSettings(defaultHarnessConfig, { chunking: mastraDefaultChunking }),
            toQuestionDocuments(questions),
        );
        expect(observed.overWindowChunkCount).toBeGreaterThan(0);
        expect(observed.truncatedChunkCount).toBe(observed.overWindowChunkCount);
        expect([observed.storedRowCount, observed.reachableRowCount]).toEqual([
            observed.chunkCount,
            observed.chunkCount,
        ]);
    });

    test('clean chunks over paragraphs: nothing over the window, nothing truncated, every row reachable', async () => {
        const observed = await observe(defaultHarnessConfig, toSourceDocuments(await loadedQuestions()));
        expect([observed.overWindowChunkCount, observed.truncatedChunkCount]).toEqual([0, 0]);
        expect(observed.reachableRowCount).toBe(observed.chunkCount);
    });

    test('a zero vector is stored but no query reaches its row', async () => {
        const observed = await observe(
            withEmbedderWrapper(defaultHarnessConfig, zeroFirstVector),
            toSourceDocuments(await loadedQuestions()),
        );
        expect(observed.storedRowCount).toBe(observed.chunkCount);
        expect(observed.reachableRowCount).toBe(observed.storedRowCount - 1);
    });

    test('a missing vector leaves the store one row short of the chunker', async () => {
        const observed = await observe(
            withEmbedderWrapper(defaultHarnessConfig, dropLastVector),
            toSourceDocuments(await loadedQuestions()),
        );
        expect(observed.storedRowCount).toBe(observed.chunkCount - 1);
    });
});
