import { createRequire } from 'node:module';

import { fastembed } from '@mastra/fastembed';
import { embed, embedMany } from 'ai';
import { z } from 'zod';

import { modelIdSchema, type TokenCount } from '../../trace/index.ts';
import { inBatches } from './batches.ts';
import type { Embedder } from './model.ts';

/** Read through `require`: Mastra's dev bundler drops JSON import attributes, which Node then rejects. */
const fastembedVersion = z
    .object({ version: z.string().min(1) })
    .parse(createRequire(import.meta.url)('@mastra/fastembed/package.json')).version;

const bgeSmallDimension = 384;
const bgeSmallModelId = modelIdSchema.parse('bge-small-en-v1.5');

const embedInBatches = async (texts: readonly string[], batchSize: number): Promise<readonly number[][]> =>
    (
        await Array.fromAsync(
            inBatches(texts, batchSize),
            async (batch) => (await embedMany({ model: fastembed, values: [...batch] })).embeddings,
        )
    ).flat();

export const createFastembedEmbedder = (maxInputTokens: TokenCount, batchSize: number): Embedder => ({
    modelId: bgeSmallModelId,
    fingerprint: `${bgeSmallModelId};maxInputTokens=${maxInputTokens};@mastra/fastembed@${fastembedVersion}`,
    dimension: bgeSmallDimension,
    maxInputTokens,
    embedDocuments: (texts) => embedInBatches(texts, batchSize),
    embedQuery: async (text) => (await embed({ model: fastembed, value: text })).embedding,
});
