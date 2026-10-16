import { tokenCountSchema, type TokenCount } from '../../trace/index.ts';
import { tokenizerFilePath } from './model-files.ts';
import { sharedTokenizer } from './shared-tokenizer.ts';

export type TokenCounter = {
    /** Names the tokenizer, so a report says how its counts were measured. */
    readonly name: string;
    readonly countTokens: (text: string) => Promise<TokenCount>;
};

/**
 * Counts with the embedder's own tokenizer file and library (`@mastra/fastembed` 1.3.3 depends on
 * `@anush008/tokenizers` 0.6.0), but without the truncation the embedder applies, so overflow stays visible.
 * The count includes the `[CLS]` and `[SEP]` tokens the embedder adds.
 */
export const createEmbedderTokenCounter = (modelDirectory: string): TokenCounter => {
    const tokenizer = sharedTokenizer(tokenizerFilePath(modelDirectory));
    return {
        name: 'embedder tokenizer (tokenizer.json, untruncated)',
        countTokens: async (text) => tokenCountSchema.parse((await tokenizer.encode(text)).getLength()),
    };
};
