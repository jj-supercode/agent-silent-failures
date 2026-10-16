import { createHash } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { homedir } from 'node:os';
import { join } from 'node:path';

import { z } from 'zod';

import type { Embedder, Vector } from './model.ts';

export const defaultEmbeddingCacheDirectory = join(homedir(), '.cache', 'agent-silent-failures', 'embeddings');

const cachedVectorSchema = z.array(z.number()).readonly();

type EmbeddingPurpose = 'document' | 'query';

const cachePath = (directory: string, fingerprint: string, purpose: EmbeddingPurpose, text: string): string =>
    join(directory, `${createHash('sha256').update([fingerprint, purpose, text].join('\u0000')).digest('hex')}.json`);

const readCachedVector = async (path: string, dimension: number): Promise<Vector | null> => {
    try {
        const vector = cachedVectorSchema.safeParse(JSON.parse(await readFile(path, 'utf8')));
        return vector.success && vector.data.length === dimension ? vector.data : null;
    } catch {
        return null;
    }
};

/** Write-then-rename, so a concurrent reader sees a whole vector or none. */
const writeCachedVector = async (path: string, vector: Vector): Promise<void> => {
    const temporaryPath = `${path}.${process.pid}.tmp`;
    await writeFile(temporaryPath, JSON.stringify(vector));
    await rename(temporaryPath, path);
};

type CachedEmbedding = { readonly text: string; readonly vector: Vector | null };

/**
 * Content-addressed disk cache under the base embedder. It sits below every fault wrapper, so faults still act on
 * each call; the key is the embedder fingerprint plus the text, so a hit returns what that exact embedder would compute.
 */
export const withDiskEmbeddingCache =
    (directory: string) =>
    (embedder: Embedder): Embedder => {
        const pathFor = (purpose: EmbeddingPurpose, text: string) =>
            cachePath(directory, embedder.fingerprint, purpose, text);
        const readAll = async (
            purpose: EmbeddingPurpose,
            texts: readonly string[],
        ): Promise<readonly CachedEmbedding[]> => {
            await mkdir(directory, { recursive: true });
            return Promise.all(
                texts.map(async (text) => ({
                    text,
                    vector: await readCachedVector(pathFor(purpose, text), embedder.dimension),
                })),
            );
        };
        const store = async (purpose: EmbeddingPurpose, text: string, vector: Vector): Promise<Vector> => {
            await writeCachedVector(pathFor(purpose, text), vector);
            return vector;
        };
        return {
            ...embedder,
            embedDocuments: async (texts) => {
                const cached = await readAll('document', texts);
                const missing = cached.filter(({ vector }) => vector === null).map(({ text }) => text);
                const fresh = await embedder.embedDocuments(missing);
                const freshByText = new Map(
                    await Promise.all(
                        fresh.flatMap((vector, index) => {
                            const text = missing[index];
                            return text === undefined
                                ? []
                                : [store('document', text, vector).then((stored) => [text, stored] as const)];
                        }),
                    ),
                );
                return cached.flatMap(({ text, vector }) => {
                    const resolved = vector ?? freshByText.get(text);
                    return resolved === undefined ? [] : [resolved];
                });
            },
            embedQuery: async (text) => {
                const [cached] = await readAll('query', [text]);
                return cached?.vector ?? store('query', text, await embedder.embedQuery(text));
            },
        };
    };
