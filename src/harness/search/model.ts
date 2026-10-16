import type { LibSQLVector } from '@mastra/libsql';
import { z } from 'zod';

import { chunkIdSchema, sourceIdSchema, type RetrievalHit } from '../../trace/index.ts';
import type { ScenarioContext } from '../scenario.ts';

export type VectorFilter = NonNullable<Parameters<LibSQLVector['query']>[0]['filter']>;

/** Where a retrieval sits in its run, so a fault can act on some calls only (e.g. the first one). */
export type SearchCallContext = {
    readonly scenario: ScenarioContext;
    /** Completed `searchCorpus` calls earlier in the same agent run. */
    readonly priorCalls: number;
};

export type RetrievalRequest = {
    readonly query: string;
    readonly topK: number;
    readonly metadataFilter: VectorFilter | null;
    readonly minScore: number | null;
    readonly call: SearchCallContext;
};

/** The retrieval seam: faults wrap it (flatten scores, filter on a wrong key, drop rows). */
export type Retriever = (request: RetrievalRequest) => Promise<readonly RetrievalHit[]>;
export type RetrieverWrapper = (retriever: Retriever) => Retriever;

/** NaN is allowed on purpose: a broken store or fusion layer produces it, and the trace must show it. */
const searchScoreSchema = z.union([z.number(), z.nan()]);

export const searchHitSchema = z.object({
    chunkId: chunkIdSchema,
    sourceId: sourceIdSchema,
    score: searchScoreSchema,
    text: z.string(),
    /** The label an answer cites this row by, unique within the run, workers included (see `citationLabel`). */
    citation: z.string(),
});
export type SearchHit = z.infer<typeof searchHitSchema>;

export const searchCorpusHitsSchema = z.object({ hits: z.array(searchHitSchema).readonly() });

/** Error-as-result, the MCP and OpenAI Agents SDK convention for a tool failure the model should see. */
export const searchCorpusErrorSchema = z.object({ error: z.string().min(1) });

export const searchCorpusOutputSchema = z.union([searchCorpusHitsSchema, searchCorpusErrorSchema]);
export type SearchCorpusOutput = z.infer<typeof searchCorpusOutputSchema>;

/** The tool-result seam: faults rewrite what `searchCorpus` returns (e.g. into an error payload). */
export type SearchOutputWrapper = (
    output: SearchCorpusOutput,
    call: SearchCallContext & { readonly query: string },
) => SearchCorpusOutput;
