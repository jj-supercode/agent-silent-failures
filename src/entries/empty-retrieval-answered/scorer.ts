import { createEntryScorer } from '../create-entry-scorer.ts';
import { defineEmptyRetrievalAnsweredEntry, type EmptyRetrievalAnsweredOptions } from './entry.ts';

/** A code-only Mastra trace scorer for empty-retrieval-answered; register it on the instance that stores the traces. */
export const createEmptyRetrievalAnsweredScorer = (options: EmptyRetrievalAnsweredOptions) =>
    createEntryScorer(defineEmptyRetrievalAnsweredEntry(options));
