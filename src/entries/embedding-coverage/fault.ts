import {
    defineFault,
    inBatches,
    mastraDefaultChunking,
    withEmbedderWrapper,
    withSettings,
    type EmbedderWrapper,
} from '../../harness/index.ts';

/**
 * `@mastra/rag`'s recursive chunker defaults (4,000 characters, 200 overlap) feeding `@mastra/fastembed`'s 512-token
 * window. This is the shipped default configuration, not a synthetic break. It only overflows on documents longer
 * than about 2,000 characters, so the bed runs it on question-level documents; per-paragraph documents stay clear.
 */
export const defaultChunkSizeFault = defineFault({
    id: 'default-chunk-size',
    description: "Mastra's default 4,000-character chunks into a 512-token local embedder, over long documents.",
    severities: ['mastra-defaults'],
    apply: (config) => withSettings(config, { chunking: mastraDefaultChunking }),
});

/** The batch size a provider caps silently in this reproduction. */
const providerBatchSize = 8;

/** A provider that answers each batch with at most `kept` vectors and no error, as some capped APIs do. */
const capEachBatch =
    (kept: number): EmbedderWrapper =>
    (embedder) => ({
        ...embedder,
        embedDocuments: async (texts) =>
            (
                await Array.fromAsync(inBatches(texts, providerBatchSize), (batch) =>
                    embedder.embedDocuments(batch.slice(0, kept)),
                )
            ).flat(),
    });

const keptVectorsPerBatch = { 'keeps-7-of-8': 7, 'keeps-4-of-8': 4 } as const;

export const embedBatchCapFault = defineFault({
    id: 'embed-batch-cap',
    description: `Each batch of ${providerBatchSize} chunks comes back with fewer vectors; the upsert stores what it got.`,
    severities: ['keeps-7-of-8', 'keeps-4-of-8'],
    apply: (config, severity) => withEmbedderWrapper(config, capEachBatch(keptVectorsPerBatch[severity])),
});

/** Replaces every `period`-th document vector with zeros: a failed embedding call filled in with a zero vector. */
const zeroEveryNth =
    (period: number): EmbedderWrapper =>
    (embedder) => ({
        ...embedder,
        embedDocuments: async (texts) =>
            (await embedder.embedDocuments(texts)).map((vector, index) =>
                index % period === 0 ? vector.map(() => 0) : vector,
            ),
    });

const zeroedVectorPeriod = { 'every-tenth': 10, 'every-second': 2 } as const;

export const zeroVectorsFault = defineFault({
    id: 'zero-vectors',
    description: 'Some document vectors are zeros. LibSQL accepts them and never returns those rows for any query.',
    severities: ['every-tenth', 'every-second'],
    apply: (config, severity) => withEmbedderWrapper(config, zeroEveryNth(zeroedVectorPeriod[severity])),
});

/** Every reproduction of this entry. `defaultChunkSizeFault` reproduces only over long, question-level documents. */
export const embeddingCoverageFaults = [defaultChunkSizeFault, embedBatchCapFault, zeroVectorsFault] as const;
