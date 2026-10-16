import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { sourceIdSchema, toolNameSchema } from '../../trace/index.ts';
import type { PagedSources } from './source-pages.ts';

export const readSourceToolId = toolNameSchema.parse('readSource');

export const readSourceArgsSchema = z.object({
    sourceId: sourceIdSchema.describe('The exact title of the source to read'),
    page: z.int().min(1).describe('1-based page number'),
});

export const sourcePageSchema = z.object({
    sourceId: sourceIdSchema,
    page: z.int().min(1),
    text: z.string(),
    hasMore: z.boolean(),
});

export const readSourceOutputSchema = z.union([sourcePageSchema, z.object({ error: z.string().min(1) })]);

/** A paginated reader over the ingested documents, the checker's only tool. */
export const createReadSourceTool = (pages: PagedSources) =>
    createTool({
        id: readSourceToolId,
        description: 'Reads one page of a source document by its exact title. Pages hold two sentences.',
        inputSchema: readSourceArgsSchema,
        outputSchema: readSourceOutputSchema,
        execute: ({ sourceId, page }) =>
            Promise.resolve(pages(sourceId, page) ?? { error: `no page ${page} in source "${sourceId}"` }),
    });
