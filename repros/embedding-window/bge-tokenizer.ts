import { homedir } from 'node:os';
import { join } from 'node:path';
import { Tokenizer } from '@anush008/tokenizers';
import { EmbeddingModel, FlagEmbedding } from '@mastra/fastembed';
import { z } from 'zod';

/** The cache `@mastra/fastembed` uses for its `fastembed` export (`getModelCachePath`, src/model-cache.ts). */
export const fastembedCacheDirectory = join(homedir(), '.cache', 'mastra', 'fastembed-models');

/** `@mastra/fastembed` truncates every input to this many tokens, special tokens included. */
export const fastembedMaxTokens = 512;
export const specialTokensPerInput = 2;
export const fastembedMaxContentTokens = fastembedMaxTokens - specialTokensPerInput;

const characterSpanSchema = z.tuple([z.number().int(), z.number().int()]);

export type TokenCoverage = {
    readonly contentTokens: number;
    readonly characters: number;
    /** Length of the prefix that survives truncation; equals `characters` when the input fits. */
    readonly embeddedCharacters: number;
};

export type BgeTokenCounter = {
    readonly coverageOf: (text: string) => Promise<TokenCoverage>;
};

/**
 * Loads the exact tokenizer file fastembed uses (downloading the model on first use, as fastembed would),
 * with truncation and padding off so overflow stays visible.
 */
export const loadBgeTokenCounter = async (): Promise<BgeTokenCounter> => {
    const modelDirectory = await FlagEmbedding.retrieveModel(
        EmbeddingModel.BGESmallENV15,
        fastembedCacheDirectory,
        false,
    );
    const tokenizer = Tokenizer.fromFile(join(String(modelDirectory), 'tokenizer.json'));
    tokenizer.disableTruncation();
    tokenizer.disablePadding();

    const coverageOf = async (text: string): Promise<TokenCoverage> => {
        const encoding = await tokenizer.encode(text);
        const contentTokens = encoding.getLength() - specialTokensPerInput;
        if (contentTokens <= fastembedMaxContentTokens) {
            return { contentTokens, characters: text.length, embeddedCharacters: text.length };
        }
        const [, lastEmbeddedCharacterEnd] = characterSpanSchema.parse(
            encoding.getOffsets()[fastembedMaxContentTokens],
        );
        return { contentTokens, characters: text.length, embeddedCharacters: lastEmbeddedCharacterEnd };
    };

    return { coverageOf };
};
