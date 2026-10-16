import { createEntryScorer } from '../create-entry-scorer.ts';
import { ignoredWorkerResultEntry } from './entry.ts';

export const ignoredWorkerResultScorer = createEntryScorer(ignoredWorkerResultEntry);
