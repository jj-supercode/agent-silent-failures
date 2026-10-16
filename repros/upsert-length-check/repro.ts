// Checked, not a bug: what happens when an embedder returns fewer vectors than it was given chunks. Both layers of
// the documented stack refuse it loudly: `embedMany` throws AI_InvalidResponseDataError, and `LibSQLVector.upsert`
// throws METADATA_LENGTH_MISMATCH when the short vector list meets Mastra's documented `metadata: chunks.map(...)`.
// Rows are misattributed silently only when user code both skips those checks (its own embedding loop) and builds
// metadata from the embeddings side (a positional zip).
import { LibSQLVector } from '@mastra/libsql';
import { embedMany } from 'ai';
import { MockEmbeddingModelV4 } from 'ai/test';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';

const indexName = 'chunks';
const dimension = 3;
const chunkTexts = ['alpha', 'beta', 'gamma', 'delta'] as const;
const returnedVectorCount = chunkTexts.length - 1;

const vectorsFor = (values: readonly string[]): number[][] =>
    values.slice(0, returnedVectorCount).map((_, index) => [1, index + 1, 0]);

/** A provider that drops the last input of a batch, the shape of a silently capped batch. */
const shortBatchEmbedder = new MockEmbeddingModelV4({
    maxEmbeddingsPerCall: chunkTexts.length,
    doEmbed: ({ values }) => Promise.resolve({ embeddings: vectorsFor(values), warnings: [] }),
});

/** A MastraError's `id` names the exact check; any other error is known by its name. */
const errorLabel = (error: unknown): string => {
    if (!(error instanceof Error)) {
        return String(error);
    }
    return 'id' in error ? String(error.id) : error.name;
};

/** MastraError wraps the store's own error, so the specific check sits in the cause chain. */
const errorChain = (error: unknown): string =>
    error instanceof Error && error.cause !== undefined
        ? `${errorLabel(error)} caused by ${errorChain(error.cause)}`
        : errorLabel(error);

const settle = (operation: () => Promise<unknown>): Promise<string> =>
    operation().then(
        () => 'resolved',
        (error: unknown) => `threw ${errorChain(error)}`,
    );

const embedManyOutcome = await settle(() => embedMany({ model: shortBatchEmbedder, values: [...chunkTexts] }));

/** What a hand-written embedding loop that bypasses `embedMany` would hand to the store. */
const shortVectors = vectorsFor(chunkTexts);
const store = new LibSQLVector({ id: 'repro-upsert-length', url: 'file::memory:' });
await store.createIndex({ indexName, dimension });

const documentedPattern = await settle(() =>
    store.upsert({ indexName, vectors: shortVectors, metadata: chunkTexts.map((text) => ({ text })) }),
);
const positionalZipPattern = await settle(() =>
    store.upsert({
        indexName,
        vectors: shortVectors,
        metadata: shortVectors.map((_, index) => ({ text: chunkTexts[index] })),
    }),
);
const storedRows = (await store.describeIndex({ indexName })).count;
await store.close();

await reportOutcome(
    'upsert-length-check',
    outcomeWhen(
        embedManyOutcome.includes('InvalidResponseDataError') &&
            documentedPattern.includes('METADATA_LENGTH_MISMATCH') &&
            positionalZipPattern === 'resolved',
        `an embedder returning ${returnedVectorCount} vectors for ${chunkTexts.length} inputs: embedMany ` +
            `${embedManyOutcome}; the documented upsert (metadata from chunks) ${documentedPattern}; only a positional ` +
            `zip (metadata from the vectors) ${positionalZipPattern}`,
        {
            inputs: chunkTexts.length,
            vectorsReturned: returnedVectorCount,
            embedMany: embedManyOutcome,
            documentedPattern: {
                call: 'upsert({ vectors, metadata: chunks.map(...) })',
                outcome: documentedPattern,
            },
            positionalZipPattern: {
                call: 'upsert({ vectors, metadata: vectors.map((_, i) => chunks[i]) })',
                outcome: positionalZipPattern,
                storedRows,
            },
        },
    ),
);
