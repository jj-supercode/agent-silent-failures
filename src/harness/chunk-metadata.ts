import { z } from 'zod';

import { chunkIdSchema, sourceIdSchema } from '../trace/index.ts';

/** Metadata stored with every vector; ingestion writes it, retrieval reads it back. */
export const chunkMetadataSchema = z.object({
    chunkId: chunkIdSchema,
    sourceId: sourceIdSchema,
    text: z.string(),
});
export type ChunkMetadata = z.infer<typeof chunkMetadataSchema>;
