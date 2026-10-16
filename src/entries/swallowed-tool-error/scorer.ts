import { createEntryScorer } from '../create-entry-scorer.ts';
import { defineSwallowedToolErrorEntry, swallowedToolErrorEntry, type SwallowedToolErrorOptions } from './entry.ts';

/** A code-only Mastra trace scorer for swallowed-tool-error with an agent's own failure wording. */
export const createSwallowedToolErrorScorer = (options: SwallowedToolErrorOptions) =>
    createEntryScorer(defineSwallowedToolErrorEntry(options));

export const swallowedToolErrorScorer = createEntryScorer(swallowedToolErrorEntry);
