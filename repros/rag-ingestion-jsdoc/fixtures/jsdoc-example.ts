// The `withRagIngestion` JSDoc example from @mastra/core 1.77.0 (src/observability/rag-ingestion.ts:104-121),
// with only the free identifiers it assumes (`mastra`, `doc`, `embed`, `vectorStore`) bound to real Mastra objects.
// `embed` is bound to the AI SDK `embed`, the only exported function of that name in the documented stack.
import { Mastra } from '@mastra/core/mastra';
import { withRagIngestion } from '@mastra/core/observability';
import { LibSQLVector } from '@mastra/libsql';
import { MDocument } from '@mastra/rag';
import { embed } from 'ai';

const mastra = new Mastra({});
const doc = MDocument.fromText('Canaries warned miners.');
const vectorStore = new LibSQLVector({ id: 'jsdoc', url: 'file::memory:' });

await withRagIngestion(
    {
        mastra,
        name: 'docs ingestion',
        attributes: { vectorStore: 'pgvector', indexName: 'docs' },
    },
    async (observabilityContext) => {
        const chunks = await doc.chunk({ observabilityContext });
        const { embeddings } = await embed(chunks, { observabilityContext });
        await vectorStore.upsert({
            indexName: 'docs',
            vectors: embeddings,
            observabilityContext,
        });
        return { chunkCount: chunks.length };
    },
);
