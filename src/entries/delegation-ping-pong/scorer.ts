import { createEntryScorer } from '../create-entry-scorer.ts';
import { delegationPingPongEntry } from './entry.ts';

export const delegationPingPongScorer = createEntryScorer(delegationPingPongEntry);
