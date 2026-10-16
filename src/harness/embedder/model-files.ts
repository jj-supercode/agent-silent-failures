import { readFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { EmbeddingModel, FlagEmbedding } from '@mastra/fastembed';
import { z } from 'zod';

import { tokenCountSchema, type TokenCount } from '../../trace/model.ts';

/** `@mastra/fastembed` 1.3.3 caches models here (`getModelCachePath` in its dist); it is not configurable. */
export const fastembedCacheDirectory = join(homedir(), '.cache', 'mastra', 'fastembed-models');

/**
 * `FlagEmbedding.init` defaults `maxLength` to 512 and `@mastra/fastembed` never overrides it; the tokenizer then
 * truncates every input to `min(maxLength, model_max_length)` tokens without a warning.
 */
const fastembedDefaultMaxLength = tokenCountSchema.parse(512);

const tokenizerConfigSchema = z.object({ model_max_length: tokenCountSchema });

/** Downloads the model once into the shared cache (a no-op when it is already there) and returns its directory. */
export const ensureModelFiles = async (): Promise<string> =>
    (await FlagEmbedding.retrieveModel(EmbeddingModel.BGESmallENV15, fastembedCacheDirectory, false)).toString();

export const tokenizerFilePath = (modelDirectory: string): string => join(modelDirectory, 'tokenizer.json');

/** The number of tokens the embedder actually reads per input, special tokens included. */
export const readEmbedderInputLimit = async (modelDirectory: string): Promise<TokenCount> => {
    const config = tokenizerConfigSchema.parse(
        JSON.parse(await readFile(join(modelDirectory, 'tokenizer_config.json'), 'utf8')),
    );
    return config.model_max_length < fastembedDefaultMaxLength ? config.model_max_length : fastembedDefaultMaxLength;
};
