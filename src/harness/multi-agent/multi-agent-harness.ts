import type { Mastra } from '@mastra/core/mastra';

import { createHarness, type CreateHarnessInput, type HarnessFailure } from '../harness.ts';
import type { ObservedIngestion } from '../ingestion/observed-ingestion.ts';
import type { IngestionRecord } from '../ingestion/run-ingestion.ts';
import type { HarnessSettings } from '../config.ts';
import { ragAgentKey } from '../rag-agent.ts';
import type { ScenarioOutcome } from '../run-scenario.ts';
import { searchCorpusToolId } from '../search/search-corpus-tool.ts';
import { createSupervisor } from './agents.ts';
import { supervisorKey } from './model.ts';
import { createReadSourceTool } from './read-source-tool.ts';
import { createTaskRunner, type TaskRequest } from './run-task.ts';
import { pageSources } from './source-pages.ts';

export type MultiAgentHarness = {
    readonly mastra: Mastra;
    readonly settings: HarnessSettings;
    readonly ingestion: IngestionRecord;
    readonly observedIngestion: ObservedIngestion;
    /** Runs the supervisor on one task and returns once its trace is stored and readable. */
    readonly runTask: (request: TaskRequest) => Promise<ScenarioOutcome>;
    readonly [Symbol.asyncDispose]: () => Promise<void>;
};

/** The single-agent harness failures, plus a RAG agent that no longer offers the search tool the workers share. */
export type MultiAgentHarnessFailure = HarnessFailure | { readonly kind: 'missing-search-tool' };

export type MultiAgentHarnessResult =
    | { readonly kind: 'ready'; readonly harness: MultiAgentHarness }
    | { readonly kind: 'failed'; readonly failure: MultiAgentHarnessFailure };

/**
 * The offline stack plus a supervisor with two workers. It reuses the single-agent harness whole (embedder,
 * ingestion, vector store, the `searchCorpus` tool with every fault wrapper applied) and registers the supervisor
 * on the same Mastra instance, so faults reach both harnesses through the same `HarnessConfig`. Every agent uses
 * `config.mechanisms.model`; for scripted runs that is a `createMultiAgentPolicy` routing policy.
 */
export const createMultiAgentHarness = async (input: CreateHarnessInput): Promise<MultiAgentHarnessResult> => {
    const created = await createHarness(input);
    if (created.kind === 'failed') {
        return created;
    }
    const { harness } = created;
    const searchCorpus = (await harness.mastra.getAgent(ragAgentKey).listTools())[searchCorpusToolId];
    if (searchCorpus === undefined) {
        await harness[Symbol.asyncDispose]();
        return { kind: 'failed', failure: { kind: 'missing-search-tool' } };
    }
    harness.mastra.addAgent(
        createSupervisor({
            model: input.config.mechanisms.model,
            delegationReplyWrappers: input.config.mechanisms.delegationReplyWrappers,
            searchCorpus,
            readSource: createReadSourceTool(pageSources(input.documents)),
            maxSteps: harness.settings.agent.maxSteps,
            ...(input.agentLabel === undefined ? {} : { label: input.agentLabel }),
        }),
        supervisorKey,
    );
    return {
        kind: 'ready',
        harness: {
            mastra: harness.mastra,
            settings: harness.settings,
            ingestion: harness.ingestion,
            observedIngestion: harness.observedIngestion,
            runTask: createTaskRunner(harness.mastra),
            [Symbol.asyncDispose]: harness[Symbol.asyncDispose],
        },
    };
};
