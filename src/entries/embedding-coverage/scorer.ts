import { createEntryScorer } from '../create-entry-scorer.ts';
import { embeddingCoverageEntry } from './entry.ts';

/** A code-only Mastra trace scorer over an instrumented ingestion trace (a `rag_ingestion` root with a report). */
export const embeddingCoverageScorer = createEntryScorer(embeddingCoverageEntry);
