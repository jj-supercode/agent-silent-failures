import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { modelIdSchema, tokenCountSchema } from '../../trace/index.ts';
import { withDiskEmbeddingCache } from './embedding-cache.ts';
import type { Embedder } from './model.ts';

const dimension = 2;

type CountingEmbedder = Embedder & { readonly embeddedTexts: () => readonly string[] };

/** Embeds text as [length, fingerprint length] and records every text it was asked to embed. */
const countingEmbedder = (fingerprint: string): CountingEmbedder => {
    const seen: string[] = [];
    const vectorOf = (text: string) => [text.length, fingerprint.length];
    return {
        modelId: modelIdSchema.parse('counting'),
        fingerprint,
        dimension,
        maxInputTokens: tokenCountSchema.parse(512),
        embedDocuments: (texts) => {
            seen.push(...texts);
            return Promise.resolve(texts.map(vectorOf));
        },
        embedQuery: (text) => {
            seen.push(text);
            return Promise.resolve(vectorOf(text));
        },
        embeddedTexts: () => [...seen],
    };
};

describe('withDiskEmbeddingCache', () => {
    let directory = '';
    beforeEach(async () => {
        directory = await mkdtemp(join(tmpdir(), 'embedding-cache-'));
    });
    afterEach(async () => {
        await rm(directory, { recursive: true, force: true });
    });

    test('a second call embeds only texts it has not seen, and returns vectors in input order', async () => {
        const base = countingEmbedder('model-a');
        const cached = withDiskEmbeddingCache(directory)(base);
        await cached.embedDocuments(['one', 'three']);
        expect(await cached.embedDocuments(['three', 'seven', 'one'])).toEqual([
            [5, 7],
            [5, 7],
            [3, 7],
        ]);
        expect(base.embeddedTexts()).toEqual(['one', 'three', 'seven']);
    });

    test('a different fingerprint never reuses a cached vector', async () => {
        await withDiskEmbeddingCache(directory)(countingEmbedder('model-a')).embedDocuments(['one']);
        const other = countingEmbedder('model-a;maxInputTokens=256');
        await withDiskEmbeddingCache(directory)(other).embedDocuments(['one']);
        expect(other.embeddedTexts()).toEqual(['one']);
    });

    test('query and document embeddings are cached apart', async () => {
        const base = countingEmbedder('model-a');
        const cached = withDiskEmbeddingCache(directory)(base);
        await cached.embedDocuments(['one']);
        await cached.embedQuery('one');
        await cached.embedQuery('one');
        expect(base.embeddedTexts()).toEqual(['one', 'one']);
    });
});
