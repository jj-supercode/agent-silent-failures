import type { MastraModelConfig } from '@mastra/core/llm';
import { z } from 'zod';

import { charCountSchema } from '../trace/index.ts';
import { ragAgentInstructions } from './agent-instructions.ts';
import { defaultEmbeddingCacheDirectory } from './embedder/embedding-cache.ts';
import type { EmbedderWrapper } from './embedder/model.ts';
import { answerFromHitsPolicy } from './policy/answer-from-hits.ts';
import type { DelegationReplyWrapper } from './multi-agent/delegation-reply.ts';
import type { AgentPolicy } from './policy/model.ts';
import type { RetrieverWrapper, SearchOutputWrapper } from './search/model.ts';

/** The serializer keeps 50 array items per span; a larger top K would cut rows out of every retrieval span. */
export const maxTopK = 50;

/** `@mastra/fastembed` 1.3.3 declares `maxEmbeddingsPerCall: 256`; larger batches would be split by the AI SDK anyway. */
const maxEmbeddingsPerCall = 256;

export const chunkingSettingsSchema = z
    .object({
        strategy: z.literal('recursive'),
        /** Characters, as `MDocument.chunk` measures by default; never tokens. */
        maxSize: charCountSchema.refine((size) => size > 0, { message: 'maxSize must be positive' }),
        overlap: charCountSchema,
    })
    .refine((chunking) => chunking.overlap < chunking.maxSize, { message: 'overlap must be smaller than maxSize' });
export type ChunkingSettings = z.infer<typeof chunkingSettingsSchema>;

/** `@mastra/rag` 2.6.7 recursive chunker defaults (`maxSize = 4e3`, `overlap = 200` in its dist). */
export const mastraDefaultChunking: ChunkingSettings = chunkingSettingsSchema.parse({
    strategy: 'recursive',
    maxSize: 4000,
    overlap: 200,
});

/**
 * The clean configuration. 1,000 characters stays under the embedder's 512-token window on this corpus with a wide
 * margin; the ingestion report measures it with the embedder's own tokenizer on every run.
 */
export const cleanChunking: ChunkingSettings = chunkingSettingsSchema.parse({
    strategy: 'recursive',
    maxSize: 1000,
    overlap: 100,
});

export const harnessSettingsSchema = z.object({
    chunking: chunkingSettingsSchema,
    retrieval: z.object({
        indexName: z.string().regex(/^[a-z][a-z0-9_]*$/),
        topK: z.int().min(1).max(maxTopK),
    }),
    /** At least two steps: one tool call and one answer. */
    agent: z.object({ maxSteps: z.int().min(2) }),
    /** LibSQL URL; the default in-memory database needs no server and no file. */
    vectorStoreUrl: z.string().min(1),
    embedding: z.object({
        /**
         * Texts per embedding call, run one batch after another. `@mastra/fastembed` pads every input to 512 tokens,
         * so peak memory grows with this; the vectors do not change (each input is padded to the same length).
         */
        batchSize: z.int().min(1).max(maxEmbeddingsPerCall),
    }),
    /** `false` embeds every text afresh. */
    embeddingCache: z.union([z.object({ directory: z.string().min(1) }), z.literal(false)]),
});
export type HarnessSettings = z.infer<typeof harnessSettingsSchema>;

export const defaultHarnessSettings: HarnessSettings = harnessSettingsSchema.parse({
    chunking: cleanChunking,
    retrieval: { indexName: 'corpus', topK: 5 },
    agent: { maxSteps: 10 },
    vectorStoreUrl: 'file::memory:',
    embedding: { batchSize: 8 },
    embeddingCache: { directory: defaultEmbeddingCacheDirectory },
});

export type AgentModelSource =
    | { readonly kind: 'scripted'; readonly policy: AgentPolicy }
    | { readonly kind: 'provided'; readonly model: MastraModelConfig };

/**
 * The seams a fault may change. Wrappers apply in list order, so a fault appends its wrapper and composes with the
 * ones already there; no fault ever writes into a trace.
 */
export type HarnessMechanisms = {
    readonly embedderWrappers: readonly EmbedderWrapper[];
    readonly retrieverWrappers: readonly RetrieverWrapper[];
    readonly searchOutputWrappers: readonly SearchOutputWrapper[];
    /** What a supervisor reads as each worker's reply; the workers' own runs are untouched. */
    readonly delegationReplyWrappers: readonly DelegationReplyWrapper[];
    /** The RAG agent's system prompt, recorded on every agent run span like any instructions. */
    readonly ragAgentInstructions: string;
    readonly model: AgentModelSource;
};

export type HarnessConfig = {
    readonly settings: HarnessSettings;
    readonly mechanisms: HarnessMechanisms;
};

export const defaultHarnessConfig: HarnessConfig = {
    settings: defaultHarnessSettings,
    mechanisms: {
        embedderWrappers: [],
        retrieverWrappers: [],
        searchOutputWrappers: [],
        delegationReplyWrappers: [],
        ragAgentInstructions,
        model: { kind: 'scripted', policy: answerFromHitsPolicy },
    },
};

export const withSettings = (config: HarnessConfig, settings: Partial<HarnessSettings>): HarnessConfig => ({
    ...config,
    settings: { ...config.settings, ...settings },
});

export const withEmbedderWrapper = (config: HarnessConfig, wrapper: EmbedderWrapper): HarnessConfig => ({
    ...config,
    mechanisms: { ...config.mechanisms, embedderWrappers: [...config.mechanisms.embedderWrappers, wrapper] },
});

export const withRetrieverWrapper = (config: HarnessConfig, wrapper: RetrieverWrapper): HarnessConfig => ({
    ...config,
    mechanisms: { ...config.mechanisms, retrieverWrappers: [...config.mechanisms.retrieverWrappers, wrapper] },
});

export const withSearchOutputWrapper = (config: HarnessConfig, wrapper: SearchOutputWrapper): HarnessConfig => ({
    ...config,
    mechanisms: {
        ...config.mechanisms,
        searchOutputWrappers: [...config.mechanisms.searchOutputWrappers, wrapper],
    },
});

export const withDelegationReplyWrapper = (config: HarnessConfig, wrapper: DelegationReplyWrapper): HarnessConfig => ({
    ...config,
    mechanisms: {
        ...config.mechanisms,
        delegationReplyWrappers: [...config.mechanisms.delegationReplyWrappers, wrapper],
    },
});

export const withRagAgentInstructions = (config: HarnessConfig, instructions: string): HarnessConfig => ({
    ...config,
    mechanisms: { ...config.mechanisms, ragAgentInstructions: instructions },
});

export const withModel = (config: HarnessConfig, model: AgentModelSource): HarnessConfig => ({
    ...config,
    mechanisms: { ...config.mechanisms, model },
});
