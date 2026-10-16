import type { Tokenizer } from '@anush008/tokenizers';
import { z } from 'zod';

import type { TokenCount } from '../../trace/index.ts';

/** `[CLS]` and `[SEP]`: the embedder adds both, and both count against its window. */
const specialTokensPerInput = 2;

const characterSpanSchema = z.tuple([z.int().nonnegative(), z.int().nonnegative()]);

/** The prefix of a text that an embedder with a given window actually reads. */
export type WindowHead = (text: string) => Promise<string>;

/**
 * Cuts `text` where an embedder keeping `window` tokens stops reading: the whole text when it fits, otherwise up to
 * the end of the last content token kept. The tokenizer must be untruncated, so the offsets cover the whole text;
 * offset 0 belongs to `[CLS]`, so the last kept content token sits at index `window - 2`.
 */
export const createWindowHead =
    (tokenizer: Tokenizer, window: TokenCount): WindowHead =>
    async (text) => {
        const encoding = await tokenizer.encode(text);
        if (encoding.getLength() <= window) {
            return text;
        }
        const [, end] = characterSpanSchema.parse(encoding.getOffsets()[window - specialTokensPerInput]);
        return text.slice(0, end);
    };
