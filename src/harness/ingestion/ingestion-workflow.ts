import { createWorkflow } from '@mastra/core/workflows';

import { ingestionReportSchema } from '../../trace/index.ts';
import { createChunkDocumentsStep } from './chunk-documents-step.ts';
import { createEmbedChunksStep } from './embed-chunks-step.ts';
import { ingestionInputSchema } from './model.ts';
import { createUpsertVectorsStep, type UpsertVectorsStepDependencies } from './upsert-vectors-step.ts';

export const ingestionWorkflowId = 'ingestCorpus';

export const createIngestionWorkflow = (dependencies: UpsertVectorsStepDependencies) =>
    createWorkflow({
        id: ingestionWorkflowId,
        description: 'Chunks, embeds and indexes the corpus, and reports counts an ingestion canary can check',
        inputSchema: ingestionInputSchema,
        outputSchema: ingestionReportSchema,
    })
        .then(createChunkDocumentsStep(dependencies))
        .then(createEmbedChunksStep(dependencies.embedder))
        .then(createUpsertVectorsStep(dependencies))
        .commit();

export type IngestionWorkflow = ReturnType<typeof createIngestionWorkflow>;
