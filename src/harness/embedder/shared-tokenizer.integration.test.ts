import { Tokenizer } from '@anush008/tokenizers';
import { describe, expect, test } from 'vitest';

import { ensureModelFiles, tokenizerFilePath } from './model-files.ts';
import { sharedTokenizer } from './shared-tokenizer.ts';
import { createEmbedderTokenCounter } from './token-counter.ts';

const embedderWindow = 512;
const longText = Array.from(
    { length: 120 },
    (_, index) => `Sentence ${index} names Treasure Island, Robert Louis Stevenson and the year 1883.`,
).join(' ');

const modelDirectory = await ensureModelFiles();
const tokenizerFile = tokenizerFilePath(modelDirectory);

describe('sharedTokenizer', () => {
    test('loads one instance per file', () => {
        expect(sharedTokenizer(tokenizerFile)).toBe(sharedTokenizer(tokenizerFile));
    });

    test('counts long text exactly like a freshly loaded tokenizer, untruncated', async () => {
        const fresh = (await Tokenizer.fromFile(tokenizerFile).encode(longText)).getLength();
        const counter = createEmbedderTokenCounter(modelDirectory);
        const first = await counter.countTokens(longText);
        const again = await createEmbedderTokenCounter(modelDirectory).countTokens(longText);
        expect(fresh).toBeGreaterThan(embedderWindow);
        expect(first).toBe(fresh);
        expect(again).toBe(fresh);
    });
});
