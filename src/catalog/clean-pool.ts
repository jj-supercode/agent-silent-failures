import { emptyRetrievalAbstainedHardNegative } from '../entries/empty-retrieval-answered/fault.ts';
import { entitySwapHardNegative } from '../entries/tool-loop/fault-entity-swap.ts';
import { parallelRetryHardNegative } from '../entries/tool-loop/fault-parallel-retry.ts';
import type { EntryId } from '../entries/index.ts';
import {
    mastraDefaultChunking,
    withSearchOutage,
    withSettings,
    withTransientSearchError,
    type Fault,
    type HarnessConfig,
} from '../harness/index.ts';
import {
    delegationPingPongEntry,
    embeddingCoverageEntry,
    emptyRetrievalAnsweredEntry,
    flatScoreEntry,
    ignoredWorkerResultEntry,
    swallowedToolErrorEntry,
    toolLoopEntry,
} from './bound-entries.ts';
import { variationIdSchema, type CleanVariation, type RunSetting } from './model.ts';

const singleAgentParagraphs: RunSetting = { harness: 'single-agent', documents: 'paragraphs' };
const multiAgent: RunSetting = { harness: 'multi-agent' };

const unchanged = (config: HarnessConfig): HarnessConfig => config;

const variation = ({ id, ...definition }: Omit<CleanVariation, 'id'> & { readonly id: string }): CleanVariation => ({
    id: variationIdSchema.parse(id),
    ...definition,
});

/** One clean variation per variant of a hard negative written in the fault shape, named `<id>/<variant>`. */
const hardNegativeVariations = (
    hardNegative: Fault,
    setting: RunSetting,
    hardNegativeFor: readonly EntryId[],
): readonly CleanVariation[] =>
    hardNegative.variants.map((variant) =>
        variation({
            id: `${hardNegative.id}/${variant.severity}`,
            description: hardNegative.description,
            setting,
            hardNegativeFor,
            apply: variant.apply,
        }),
    );

/**
 * The shared clean pool. Every detector is scored on every run here; a run is clean because the agent behaves
 * correctly, even when the infrastructure misbehaves (a transient error, an outage, an empty retrieval).
 */
export const cleanPool: readonly CleanVariation[] = [
    variation({
        id: 'baseline',
        description: 'The clean single-agent RAG run.',
        setting: singleAgentParagraphs,
        hardNegativeFor: [],
        apply: unchanged,
    }),
    variation({
        id: 'multi-agent-baseline',
        description:
            'The clean supervisor: two legitimate delegations with different subjects, sometimes a paginated check.',
        setting: multiAgent,
        hardNegativeFor: [delegationPingPongEntry.id, ignoredWorkerResultEntry.id, toolLoopEntry.id],
        apply: unchanged,
    }),
    variation({
        id: 'duplicated-paragraphs',
        description: 'Every paragraph ingested twice under two source ids, so top rows tie in exact pairs.',
        setting: { harness: 'single-agent', documents: 'duplicated-paragraphs' },
        hardNegativeFor: [flatScoreEntry.id],
        apply: unchanged,
    }),
    variation({
        id: 'transient-search-error',
        description:
            'The first search of each agent run returns an error payload; the agent retries once and succeeds.',
        setting: singleAgentParagraphs,
        hardNegativeFor: [swallowedToolErrorEntry.id, toolLoopEntry.id],
        apply: withTransientSearchError,
    }),
    variation({
        id: 'search-outage',
        description: 'Every search returns an error payload; the agent retries once, then abstains.',
        setting: singleAgentParagraphs,
        hardNegativeFor: [swallowedToolErrorEntry.id, emptyRetrievalAnsweredEntry.id],
        apply: withSearchOutage,
    }),
    variation({
        id: 'multi-agent-transient-search-error',
        description: 'The first search of each worker run fails; workers retry and succeed.',
        setting: multiAgent,
        hardNegativeFor: [swallowedToolErrorEntry.id, toolLoopEntry.id, delegationPingPongEntry.id],
        apply: withTransientSearchError,
    }),
    variation({
        id: 'multi-agent-search-outage',
        description: 'Every worker search fails; workers abstain and the supervisor re-delegates once.',
        setting: multiAgent,
        hardNegativeFor: [swallowedToolErrorEntry.id, delegationPingPongEntry.id, ignoredWorkerResultEntry.id],
        apply: withSearchOutage,
    }),
    // The empty-retrieval mechanisms under the clean policy, which abstains: the agent behaves correctly.
    ...hardNegativeVariations(emptyRetrievalAbstainedHardNegative, singleAgentParagraphs, [
        emptyRetrievalAnsweredEntry.id,
    ]),
    // Near-identical searches about different entities: legitimate, so tool-loop must stay clear.
    ...hardNegativeVariations(entitySwapHardNegative, singleAgentParagraphs, [toolLoopEntry.id]),
    // Two parallel searches that fail and are re-issued once: retries, the pattern a real model showed.
    ...hardNegativeVariations(parallelRetryHardNegative, singleAgentParagraphs, [
        toolLoopEntry.id,
        swallowedToolErrorEntry.id,
    ]),
    variation({
        id: 'mastra-default-chunking-short-documents',
        description:
            "Mastra's default 4,000/200 chunking over per-paragraph documents, which never exceed the embedder window.",
        setting: singleAgentParagraphs,
        hardNegativeFor: [embeddingCoverageEntry.id],
        apply: (config) => withSettings(config, { chunking: mastraDefaultChunking }),
    }),
    variation({
        id: 'clean-chunking-long-documents',
        description: "The family's clean chunking over long question-level documents: long input, no overflow.",
        setting: { harness: 'single-agent', documents: 'question-contexts' },
        hardNegativeFor: [embeddingCoverageEntry.id],
        apply: unchanged,
    }),
];
