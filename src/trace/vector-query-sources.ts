import { z } from 'zod';

import { chunkIdSchema, sourceIdSchema, type RetrievalHit, type RetrievedRows } from './model.ts';
import { splitTruncationMarker, storedScoreSchema, type RetrievedRowsDecoder } from './retrieved-rows.ts';

const vectorQueryOutputSchema = z.object({
    relevantContext: z.array(z.unknown()),
    sources: z.array(z.unknown()),
});

/** Chunk metadata as Mastra's RAG guides upsert it: the chunk text, optionally the document it came from. */
const sourceMetadataSchema = z.object({ text: z.string().optional(), source: z.string().min(1).optional() });

const vectorQuerySourceSchema = z.object({
    id: chunkIdSchema,
    score: storedScoreSchema,
    metadata: z.unknown(),
    document: z.string(),
});

const toHit = (source: z.infer<typeof vectorQuerySourceSchema>): RetrievalHit => {
    const metadata = sourceMetadataSchema.safeParse(source.metadata).data;
    return {
        chunkId: source.id,
        sourceId: sourceIdSchema.parse(metadata?.source ?? source.id),
        score: source.score,
        text: metadata?.text ?? source.document,
    };
};

const decodeSources = (sources: readonly unknown[]): RetrievedRows => {
    const { items, truncatedItems } = splitTruncationMarker(sources);
    const parsed = z.array(vectorQuerySourceSchema).safeParse(items);
    return parsed.success ? { kind: 'rows', hits: parsed.data.map(toHit), truncatedItems } : { kind: 'not-rows' };
};

/**
 * Decodes the output of `createVectorQueryTool` from `@mastra/rag`: `{ relevantContext, sources }`, scores in
 * `sources`. A source is attributed to its `metadata.source` when present, else to its own chunk id. With
 * `includeSources: false` the tool returns context but no sources, so there are no scores to judge: `not-rows`,
 * never zero hits. The tool also returns both lists empty when its store query throws (a missing index, for one),
 * which is exactly the empty retrieval the trace cannot tell apart from no match.
 */
export const decodeVectorQuerySources: RetrievedRowsDecoder = (output) => {
    const parsed = vectorQueryOutputSchema.safeParse(output);
    if (!parsed.success) {
        return { kind: 'not-rows' };
    }
    const { relevantContext, sources } = parsed.data;
    return sources.length === 0 && relevantContext.length > 0 ? { kind: 'not-rows' } : decodeSources(sources);
};
