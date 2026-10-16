import { createEntryScorer } from '../create-entry-scorer.ts';
import { toolLoopEntry } from './entry.ts';

export const toolLoopScorer = createEntryScorer(toolLoopEntry);
