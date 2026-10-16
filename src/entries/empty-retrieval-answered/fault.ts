import {
    defineFault,
    withEmbedderWrapper,
    withModel,
    withRetrieverWrapper,
    type EmbedderWrapper,
    type HarnessConfig,
    type RetrieverWrapper,
} from '../../harness/index.ts';
import { answerFromMemoryOnEmptyPolicy } from './fault-policy.ts';

/** A cut-off tuned for another embedder's score scale; bge-small cosine scores on this corpus top out near 0.88. */
const foreignMinScore = 0.99;

/** The store holds `sourceId`; the tool filters on a key no row has, which LibSQL answers with zero rows. */
const filterOnMissingKey: RetrieverWrapper = (retriever) => (request) =>
    retriever({ ...request, metadataFilter: { doc_id: { $eq: request.call.scenario.questionId } } });

const requireForeignMinScore: RetrieverWrapper = (retriever) => (request) =>
    retriever({ ...request, minScore: foreignMinScore });

/** A failed query embedding that comes back as zeros; LibSQL ranks nothing against a zero vector and returns []. */
const zeroQueryVectors: EmbedderWrapper = (embedder) => ({
    ...embedder,
    embedQuery: () => Promise.resolve(Array.from({ length: embedder.dimension }, () => 0)),
});

const emptyingMechanisms = {
    'filter-key-mismatch': (config: HarnessConfig) => withRetrieverWrapper(config, filterOnMissingKey),
    'min-score-too-high': (config: HarnessConfig) => withRetrieverWrapper(config, requireForeignMinScore),
    'zero-query-vector': (config: HarnessConfig) => withEmbedderWrapper(config, zeroQueryVectors),
} as const satisfies Record<string, (config: HarnessConfig) => HarnessConfig>;

const emptyingSeverities = [
    'filter-key-mismatch',
    'min-score-too-high',
    'zero-query-vector',
] as const satisfies readonly (keyof typeof emptyingMechanisms)[];

const answeringFromMemory = (config: HarnessConfig): HarnessConfig =>
    withModel(config, { kind: 'scripted', policy: answerFromMemoryOnEmptyPolicy });

/**
 * Two parts, both needed for the failure: retrieval silently returns nothing, and the model answers anyway. With
 * the clean policy the same retrieval faults end in an abstention, the hard negative this entry must stay clear on.
 */
export const emptyRetrievalAnsweredFault = defineFault({
    id: 'empty-retrieval-answered-from-memory',
    description:
        'Retrieval returns zero rows (a filter on a missing key, a foreign score cut-off, a zero query vector) and ' +
        'the model answers from memory instead of abstaining.',
    severities: emptyingSeverities,
    apply: (config, severity) => answeringFromMemory(emptyingMechanisms[severity](config)),
});

/** The retrieval half alone, under the clean policy: every run should end in an abstention. */
export const emptyRetrievalAbstainedHardNegative = defineFault({
    id: 'empty-retrieval-abstained',
    description: 'The same zero-row retrieval faults with the clean policy, which abstains: must stay clear.',
    severities: emptyingSeverities,
    apply: (config, severity) => emptyingMechanisms[severity](config),
});
