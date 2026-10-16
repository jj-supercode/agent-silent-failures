import { chunkDocumentsStepId } from './chunk-documents-step.ts';
import { chunkedCorpusSchema, type IngestedChunk } from './model.ts';

/** A workflow step result as `run.start()` returns it, reduced to what this read needs. */
export type StepResultLike = { readonly status: string; readonly output?: unknown } | undefined;

export type ChunkedCorpusRead =
    | { readonly kind: 'read'; readonly chunks: readonly IngestedChunk[] }
    | { readonly kind: 'unreadable'; readonly reason: string };

/**
 * The chunk list the chunk step produced. Anything else is unreadable, never an empty list: without the chunks the
 * ingestion cannot be observed, and an empty list would read as "nothing to lose".
 */
export const chunkedCorpusOfStep = (step: StepResultLike): ChunkedCorpusRead => {
    if (step?.status !== 'success') {
        return { kind: 'unreadable', reason: `the ${chunkDocumentsStepId} step did not succeed` };
    }
    const chunked = chunkedCorpusSchema.safeParse(step.output);
    return chunked.success
        ? { kind: 'read', chunks: chunked.data.chunks }
        : {
              kind: 'unreadable',
              reason: `the ${chunkDocumentsStepId} step output is unreadable: ${chunked.error.message}`,
          };
};
