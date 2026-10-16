import { z } from 'zod';

import { chunkIdSchema, sourceIdSchema, type RetrievedRows } from './model.ts';

/** Turns one retrieval tool's span output into rows; a third-party tool registers its own decoder. */
export type RetrievedRowsDecoder = (output: unknown) => RetrievedRows;

/** The span serializer replaces array items past its cap with one trailing string, e.g. `"[…10 more items]"`. */
const truncationMarkerPattern = /^\[…(\d+) more items\]$/;

const truncatedItemCount = (item: unknown): number | null => {
    const match = typeof item === 'string' ? truncationMarkerPattern.exec(item) : null;
    return match?.[1] === undefined ? null : Number(match[1]);
};

export type SerializedArray = { readonly items: readonly unknown[]; readonly truncatedItems: number };

/** Separates a serialized span array into its kept items and the count of items its trailing marker stands for. */
export const splitTruncationMarker = (serialized: readonly unknown[]): SerializedArray => {
    const truncatedItems = truncatedItemCount(serialized.at(-1));
    return truncatedItems === null
        ? { items: serialized, truncatedItems: 0 }
        : { items: serialized.slice(0, -1), truncatedItems };
};

/** JSON has no NaN or Infinity: a non-finite score is stored as `null`, and decodes back to `NaN`. */
export const storedScoreSchema = z
    .custom<number>((value) => typeof value === 'number')
    .nullable()
    .transform((score) => score ?? Number.NaN);

const hitSchema = z.object({
    chunkId: chunkIdSchema,
    sourceId: sourceIdSchema,
    score: storedScoreSchema,
    text: z.string(),
});

const hitListOutputSchema = z.object({ hits: z.array(z.unknown()) });

/** Decodes `{ hits: { chunkId, sourceId, score, text }[] }`, the shape of the harness `searchCorpus` tool. */
export const decodeHitList: RetrievedRowsDecoder = (output) => {
    const parsedOutput = hitListOutputSchema.safeParse(output);
    if (!parsedOutput.success) {
        return { kind: 'not-rows' };
    }
    const { items, truncatedItems } = splitTruncationMarker(parsedOutput.data.hits);
    const hits = z.array(hitSchema).safeParse(items);
    return hits.success ? { kind: 'rows', hits: hits.data, truncatedItems } : { kind: 'not-rows' };
};
