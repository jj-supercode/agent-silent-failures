import type { Mastra } from '@mastra/core/mastra';
import type { MastraMemory } from '@mastra/core/memory';
import { LibSQLVector } from '@mastra/libsql';
import { z } from 'zod';

import type { SourceDocument } from '../corpus/index.ts';
import type { AgentLabel } from './agent-label.ts';
import { harnessSettingsSchema, type HarnessConfig, type HarnessSettings } from './config.ts';
import { createFastembedEmbedder } from './embedder/fastembed-embedder.ts';
import { withDiskEmbeddingCache } from './embedder/embedding-cache.ts';
import type { Embedder, EmbedderWrapper } from './embedder/model.ts';
import { ensureModelFiles, readEmbedderInputLimit, tokenizerFilePath } from './embedder/model-files.ts';
import { sharedTokenizer } from './embedder/shared-tokenizer.ts';
import { createEmbedderTokenCounter } from './embedder/token-counter.ts';
import { createWindowHead } from './embedder/window-head.ts';
import { createHarnessMastra, type HarnessMastraInput } from './harness-mastra.ts';
import { createIngestionWorkflow, ingestionWorkflowId } from './ingestion/ingestion-workflow.ts';
import { observeIngestion, type ObservedIngestion } from './ingestion/observed-ingestion.ts';
import { runIngestion, type IngestionRecord, type RunIngestionInput } from './ingestion/run-ingestion.ts';
import { createRagAgent, ragAgentKey } from './rag-agent.ts';
import { createScenarioRunner, type ScenarioOutcome, type ScenarioRequest } from './run-scenario.ts';
import { createSearchCorpusTool } from './search/search-corpus-tool.ts';
import { createVectorRetriever } from './search/vector-retriever.ts';
import { awaitStoredTrace } from './stored-trace.ts';

export type Harness = {
    readonly mastra: Mastra;
    readonly settings: HarnessSettings;
    readonly ingestion: IngestionRecord;
    /** The ingestion's effects, read back from the store and the unwrapped embedder, never from its report. */
    readonly observedIngestion: ObservedIngestion;
    /** Runs the agent on one question and returns once its trace is stored and readable. */
    readonly runScenario: (request: ScenarioRequest) => Promise<ScenarioOutcome>;
    readonly [Symbol.asyncDispose]: () => Promise<void>;
};

export type HarnessFailure =
    | { readonly kind: 'invalid-settings'; readonly issues: string }
    | { readonly kind: 'ingestion-failed'; readonly reason: string }
    | { readonly kind: 'ingestion-unobservable'; readonly reason: string };

export type HarnessResult =
    | { readonly kind: 'ready'; readonly harness: Harness }
    | { readonly kind: 'failed'; readonly failure: HarnessFailure };

export type CreateHarnessInput = {
    readonly config: HarnessConfig;
    readonly documents: readonly SourceDocument[];
    /** Registered on the Mastra instance, so trace scoring can hand them the instance. */
    readonly scorers?: HarnessMastraInput['scorers'];
    /** Conversation memory for the agent; only Studio passes one, so measured runs never see earlier turns. */
    readonly agentMemory?: MastraMemory;
    /** Shown on the agents' descriptions (and the top-level agents' names); only Studio passes one. */
    readonly agentLabel?: AgentLabel;
};

const applyWrappers = <T>(base: T, wrappers: readonly ((inner: T) => T)[]): T =>
    wrappers.reduce((wrapped, wrap) => wrap(wrapped), base);

const cacheWrappers = (settings: HarnessSettings): readonly EmbedderWrapper[] =>
    settings.embeddingCache === false ? [] : [withDiskEmbeddingCache(settings.embeddingCache.directory)];

type IngestedAndObserved =
    | { readonly kind: 'ready'; readonly record: IngestionRecord; readonly observed: ObservedIngestion }
    | { readonly kind: 'failed'; readonly failure: HarnessFailure };

type IngestAndObserveInput = RunIngestionInput & {
    readonly vectorStore: LibSQLVector;
    /** Under no fault wrapper, so the observation sees what the real embedder computes. */
    readonly baseEmbedder: Embedder;
    readonly modelDirectory: string;
};

const unobservable = (error: unknown): IngestedAndObserved => ({
    kind: 'failed',
    failure: { kind: 'ingestion-unobservable', reason: String(error) },
});

/**
 * Ingests once, waits until its trace is stored, then observes what the ingestion did to the store and the
 * embedder (never through its report). Any failed stage fails the whole: a harness without a readable ingestion
 * trace or observation would score runs against an unknown corpus.
 */
const ingestAndObserve = async (input: IngestAndObserveInput): Promise<IngestedAndObserved> => {
    const ingestion = await runIngestion(input);
    if (ingestion.kind === 'failed') {
        return { kind: 'failed', failure: { kind: 'ingestion-failed', reason: ingestion.reason } };
    }
    if (!(await awaitStoredTrace(input.mastra, ingestion.record.traceId))) {
        return {
            kind: 'failed',
            failure: { kind: 'ingestion-failed', reason: 'the ingestion trace never reached storage' },
        };
    }
    // `Promise.try` turns a synchronous throw (a tokenizer file that will not load) into the same rejection.
    return Promise.try(() =>
        observeIngestion({
            chunks: ingestion.record.chunks,
            vectorStore: input.vectorStore,
            indexName: input.indexName,
            embedder: input.baseEmbedder,
            windowHead: createWindowHead(
                sharedTokenizer(tokenizerFilePath(input.modelDirectory)),
                input.baseEmbedder.maxInputTokens,
            ),
        }),
    ).then((observed): IngestedAndObserved => ({ kind: 'ready', record: ingestion.record, observed }), unobservable);
};

/**
 * Builds the whole offline stack for one configuration: embedder, vector store, ingestion workflow, search tool,
 * agent and Mastra instance, then ingests the documents once. Dispose it with `await using`.
 */
export const createHarness = async ({
    config,
    documents,
    scorers,
    agentMemory,
    agentLabel,
}: CreateHarnessInput): Promise<HarnessResult> => {
    const settings = harnessSettingsSchema.safeParse(config.settings);
    if (!settings.success) {
        return { kind: 'failed', failure: { kind: 'invalid-settings', issues: z.prettifyError(settings.error) } };
    }
    const { chunking, retrieval, agent, vectorStoreUrl } = settings.data;
    const modelDirectory = await ensureModelFiles();
    const baseEmbedder: Embedder = applyWrappers(
        createFastembedEmbedder(await readEmbedderInputLimit(modelDirectory), settings.data.embedding.batchSize),
        cacheWrappers(settings.data),
    );
    const embedder = applyWrappers(baseEmbedder, config.mechanisms.embedderWrappers);
    const vectorStore = new LibSQLVector({ id: 'corpus-vectors', url: vectorStoreUrl });
    const workflow = createIngestionWorkflow({
        vectorStore,
        indexName: retrieval.indexName,
        embedder,
        chunking,
        tokenCounter: createEmbedderTokenCounter(modelDirectory),
    });
    const retriever = applyWrappers(
        createVectorRetriever({ vectorStore, indexName: retrieval.indexName, embedder }),
        config.mechanisms.retrieverWrappers,
    );
    const searchCorpus = createSearchCorpusTool({
        retriever,
        topK: retrieval.topK,
        outputWrappers: config.mechanisms.searchOutputWrappers,
    });
    const mastra = createHarnessMastra({
        agents: {
            [ragAgentKey]: createRagAgent({
                model: config.mechanisms.model,
                instructions: config.mechanisms.ragAgentInstructions,
                searchCorpus,
                maxSteps: agent.maxSteps,
                ...(agentMemory === undefined ? {} : { memory: agentMemory }),
                ...(agentLabel === undefined ? {} : { label: agentLabel }),
            }),
        },
        workflows: { [ingestionWorkflowId]: workflow },
        ...(scorers === undefined ? {} : { scorers }),
    });
    const dispose = async () => {
        await mastra.shutdown();
        await vectorStore.close();
    };
    const ingested = await ingestAndObserve({
        mastra,
        workflow,
        documents,
        indexName: retrieval.indexName,
        embedder,
        vectorStore,
        baseEmbedder,
        modelDirectory,
    });
    if (ingested.kind === 'failed') {
        await dispose();
        return ingested;
    }
    return {
        kind: 'ready',
        harness: {
            mastra,
            settings: settings.data,
            ingestion: ingested.record,
            observedIngestion: ingested.observed,
            runScenario: createScenarioRunner(mastra),
            [Symbol.asyncDispose]: dispose,
        },
    };
};
