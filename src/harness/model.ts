import { z } from 'zod';

/** A row id in the vector store. The harness writes chunk ids as vector ids, but a store may hold others. */
export const vectorIdSchema = z.string().min(1).brand<'VectorId'>();
export type VectorId = z.infer<typeof vectorIdSchema>;
