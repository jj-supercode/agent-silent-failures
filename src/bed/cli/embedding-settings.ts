import { z } from 'zod';

import type { HarnessSettings } from '../../harness/index.ts';

/** The `parseArgs` options both `pnpm bed` and `pnpm demo` accept for embedding cost. */
export const embeddingArgOptions = {
    'embedding-batch-size': { type: 'string' },
    cold: { type: 'boolean', default: false },
} as const;

const embeddingArgsSchema = z.object({
    'embedding-batch-size': z.coerce.number().int().positive().optional(),
    cold: z.boolean(),
});

/**
 * Settings laid over every planned harness. A smaller batch lowers peak memory on a cold cache and leaves vectors
 * unchanged (bit-identical at batch sizes 4, 8, 16 and 32); `--cold` switches the embedding cache off, the worst case.
 */
export const embeddingSettingsFromArgs = (values: unknown): Partial<HarnessSettings> => {
    const parsed = embeddingArgsSchema.parse(values);
    const batchSize = parsed['embedding-batch-size'];
    return {
        ...(batchSize === undefined ? {} : { embedding: { batchSize } }),
        ...(parsed.cold ? { embeddingCache: false } : {}),
    };
};
