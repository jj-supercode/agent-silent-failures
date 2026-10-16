import type { RunViewOptions } from '../../trace/index.ts';
import { createEntryScorer } from '../create-entry-scorer.ts';
import { defineFlatScoreEntry } from './entry.ts';

/** A code-only Mastra trace scorer for flat-score; register it on the Mastra instance that stores the traces. */
export const createFlatScoreScorer = (runViewOptions: RunViewOptions) =>
    createEntryScorer(defineFlatScoreEntry(runViewOptions));
