import { defineIngestionEntry, entryIdSchema } from '../contract.ts';
import { detectEmbeddingCoverage } from './detector.ts';
import { embeddingCoverageThresholds } from './model.ts';

export const embeddingCoverageEntryId = entryIdSchema.parse('embedding-coverage');

export const embeddingCoverageEntry = defineIngestionEntry({
    id: embeddingCoverageEntryId,
    title: 'Embedding coverage',
    summary:
        'Part of the corpus is silently unsearchable: chunk tails past the embedder window, or chunks without vectors.',
    family: 'rag-ingest',
    status: 'stable',
    thresholds: embeddingCoverageThresholds,
    detect: detectEmbeddingCoverage,
});
