import type { Mastra } from '@mastra/core/mastra';

import type { CorpusQuestion, SourceDocument } from '../../corpus/index.ts';
import { loadRunView, type RunView, type TraceId } from '../../trace/index.ts';
import type { HarnessConfig } from '../config.ts';
import { createHarness, type CreateHarnessInput } from '../harness.ts';
import { harnessRetrievalTools } from '../retrieval-tools.ts';
import type { ScenarioOutcome } from '../run-scenario.ts';
import { SmokeRunError } from './errors.ts';
import { createMultiAgentHarness } from './multi-agent-harness.ts';
import { toSupervisorTask } from './task-suite.ts';

export type RunViewsRequest = {
    readonly config: HarnessConfig;
    readonly documents: readonly SourceDocument[];
    readonly questions: readonly CorpusQuestion[];
    readonly seeds: readonly number[];
    readonly scorers?: CreateHarnessInput['scorers'];
};

/** A completed run: its trace id and its run view, read back from the harness's own storage. */
export type ViewedRun = { readonly traceId: TraceId; readonly view: RunView; readonly mastra: Mastra };

type HarnessCreation<THarness> =
    { readonly kind: 'ready'; readonly harness: THarness } | { readonly kind: 'failed'; readonly failure: unknown };

const readyHarness = <THarness>(creation: HarnessCreation<THarness>): THarness => {
    if (creation.kind === 'failed') {
        throw new SmokeRunError(JSON.stringify(creation.failure));
    }
    return creation.harness;
};

const viewOf = async (mastra: Mastra, outcome: ScenarioOutcome): Promise<ViewedRun> => {
    if (outcome.kind === 'failed') {
        throw new SmokeRunError(outcome.reason);
    }
    const loaded = await loadRunView(mastra, outcome.run.traceId, { retrievalTools: harnessRetrievalTools });
    if (loaded.kind !== 'loaded') {
        throw new SmokeRunError(`run view of ${outcome.run.traceId} did not load: ${loaded.kind}`);
    }
    return { traceId: outcome.run.traceId, view: loaded.view, mastra };
};

/** Runs the requests one after another (runs share one Mastra instance) and reads each trace back. */
const viewsOf = <TRequest>(
    mastra: Mastra,
    requests: readonly TRequest[],
    run: (request: TRequest) => Promise<ScenarioOutcome>,
): Promise<readonly ViewedRun[]> => Array.fromAsync(requests, async (request) => viewOf(mastra, await run(request)));

const harnessInput = ({ config, documents, scorers }: RunViewsRequest): CreateHarnessInput => ({
    config,
    documents,
    ...(scorers === undefined ? {} : { scorers }),
});

/**
 * Runs every (seed, question) pair on a fresh single-agent harness and hands the views to `use` before the
 * harness is disposed. For smoke tests and checks of output distributions; the bed has its own runner.
 */
export const withSingleAgentRuns = async <T>(
    request: RunViewsRequest,
    use: (runs: readonly ViewedRun[]) => Promise<T> | T,
): Promise<T> => {
    await using harness = readyHarness(await createHarness(harnessInput(request)));
    const scenarios = request.seeds.flatMap((seed) => request.questions.map((question) => ({ question, seed })));
    // Awaited inside the `await using` scope: `use` may still read the harness (e.g. score a stored trace).
    return await use(await viewsOf(harness.mastra, scenarios, harness.runScenario));
};

/** As `withSingleAgentRuns`, on the multi-agent harness; questions without a two-source task are skipped. */
export const withMultiAgentRuns = async <T>(
    request: RunViewsRequest,
    use: (runs: readonly ViewedRun[]) => Promise<T> | T,
): Promise<T> => {
    await using harness = readyHarness(await createMultiAgentHarness(harnessInput(request)));
    const tasks = request.questions.flatMap((question) => toSupervisorTask(question) ?? []);
    const taskRuns = request.seeds.flatMap((seed) => tasks.map((task) => ({ task, seed })));
    return await use(await viewsOf(harness.mastra, taskRuns, harness.runTask));
};
