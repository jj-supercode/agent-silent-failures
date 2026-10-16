import { resolve } from 'node:path';

import { Tokenizer } from '@anush008/tokenizers';

// A loaded tokenizer holds about 5 MB of native memory that is freed only on a major GC, which a small JS heap
// rarely triggers; one load per file keeps a process that builds hundreds of harnesses flat.
const loadedTokenizers = new Map<string, Tokenizer>();

/**
 * The tokenizer for one `tokenizer.json`, loaded once per resolved path. Callers only encode: none may call
 * `setTruncation` or `setPadding` on the shared instance, so every count stays untruncated.
 */
export const sharedTokenizer = (tokenizerFile: string): Tokenizer => {
    const path = resolve(tokenizerFile);
    const loaded = loadedTokenizers.get(path) ?? Tokenizer.fromFile(path);
    loadedTokenizers.set(path, loaded);
    return loaded;
};
