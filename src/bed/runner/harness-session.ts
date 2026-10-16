import type { Mastra } from '@mastra/core/mastra';

import {
    createHarness,
    createMultiAgentHarness,
    toSupervisorTask,
    type CreateHarnessInput,
    type Harness,
    type ObservedIngestion,
    type ScenarioOutcome,
} from '../../harness/index.ts';
import type { TraceId } from '../../trace/index.ts';
import type { HarnessPlan, RunLabels } from '../model.ts';

/** Either harness behind one interface: run one labelled agent run, read traces, dispose. */
export type HarnessSession = {
    readonly mastra: Mastra;
    readonly ingestionTraceId: TraceId;
    /** What the ingestion did to the store, measured apart from its report: what a fault's expression is checked against. */
    readonly observedIngestion: ObservedIngestion;
    readonly runAgent: (labels: RunLabels) => Promise<ScenarioOutcome>;
    readonly [Symbol.asyncDispose]: () => Promise<void>;
};

export type SessionOpening =
    { readonly kind: 'ready'; readonly session: HarnessSession } | { readonly kind: 'failed'; readonly reason: string };

const failedScenario = (labels: RunLabels, reason: string): ScenarioOutcome => ({
    kind: 'failed',
    scenario: { questionId: labels.question.id, seed: labels.seed },
    reason,
});

/** The parts both harness kinds share; only how an agent run starts differs. */
type OpenedHarness = Pick<Harness, 'mastra' | 'ingestion' | 'observedIngestion' | typeof Symbol.asyncDispose>;

const sessionOf = (harness: OpenedHarness, runAgent: HarnessSession['runAgent']): SessionOpening => ({
    kind: 'ready',
    session: {
        mastra: harness.mastra,
        ingestionTraceId: harness.ingestion.traceId,
        observedIngestion: harness.observedIngestion,
        runAgent,
        [Symbol.asyncDispose]: harness[Symbol.asyncDispose],
    },
});

const openSingleAgent = async (input: CreateHarnessInput): Promise<SessionOpening> => {
    const created = await createHarness(input);
    return created.kind === 'failed'
        ? { kind: 'failed', reason: JSON.stringify(created.failure) }
        : sessionOf(created.harness, (labels) =>
              created.harness.runScenario({ question: labels.question, seed: labels.seed }),
          );
};

const openMultiAgent = async (input: CreateHarnessInput): Promise<SessionOpening> => {
    const created = await createMultiAgentHarness(input);
    return created.kind === 'failed'
        ? { kind: 'failed', reason: JSON.stringify(created.failure) }
        : sessionOf(created.harness, async (labels) => {
              const task = toSupervisorTask(labels.question);
              return task === null
                  ? failedScenario(labels, 'the question has no two-source supervisor task')
                  : created.harness.runTask({ task, seed: labels.seed });
          });
};

/** Builds the harness a plan names: the single-agent RAG agent, or the supervisor with its two workers. */
export const openHarnessSession = (plan: HarnessPlan): Promise<SessionOpening> => {
    const input: CreateHarnessInput = { config: plan.config, documents: plan.documents };
    switch (plan.setting.harness) {
        case 'single-agent':
            return openSingleAgent(input);
        case 'multi-agent':
            return openMultiAgent(input);
        default:
            return plan.setting satisfies never;
    }
};
