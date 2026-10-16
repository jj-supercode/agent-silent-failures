import {
    defineFault,
    withEmbedderWrapper,
    withRetrieverWrapper,
    type EmbedderWrapper,
    type HarnessConfig,
    type RetrieverWrapper,
} from '../../harness/index.ts';

/** What a fusion layer reports for every row when its dense leg contributes nothing and no other leg is wired. */
const deadLegFusedScore = 0.5;

/**
 * Every text, document or query, embeds to the same unit vector: a provider or quantisation bug that returns a
 * constant embedding. Every cosine is then 1, and the store returns rows in arbitrary order.
 */
const collapseEmbeddings: EmbedderWrapper = (embedder) => {
    const constantVector = Array.from({ length: embedder.dimension }, (_, index) => (index === 0 ? 1 : 0));
    return {
        ...embedder,
        embedDocuments: (texts) => Promise.resolve(texts.map(() => constantVector)),
        embedQuery: () => Promise.resolve(constantVector),
    };
};

const rescoreRows =
    (score: number): RetrieverWrapper =>
    (retriever) =>
    async (request) =>
        (await retriever(request)).map((hit) => ({ ...hit, score }));

const flatteningMechanisms = {
    'collapsed-embedder': (config: HarnessConfig) => withEmbedderWrapper(config, collapseEmbeddings),
    'constant-fused-score': (config: HarnessConfig) => withRetrieverWrapper(config, rescoreRows(deadLegFusedScore)),
    'non-finite-scores': (config: HarnessConfig) => withRetrieverWrapper(config, rescoreRows(Number.NaN)),
} as const satisfies Record<string, (config: HarnessConfig) => HarnessConfig>;

export const flatScoreFault = defineFault({
    id: 'vector-side-off',
    description:
        'The dense side of retrieval silently stops ranking: a collapsed embedder, a fusion layer whose vector leg is ' +
        'dead, or a store that scores rows NaN. Rows still come back, so nothing errors.',
    severities: ['collapsed-embedder', 'constant-fused-score', 'non-finite-scores'],
    apply: (config, severity) => flatteningMechanisms[severity](config),
});
