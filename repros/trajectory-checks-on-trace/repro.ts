// Two trajectory checks that `createTrajectoryScorerCode` combines miss violations on the trace-derived trajectory
// of a run while catching them on its message trajectory. `checkTrajectoryBlacklist` matches `blacklistedSequences`
// against adjacent sibling names, and Mastra's `processor_run` steps sit between the tool calls in a trace.
// `analyzeToolFailures` reads only top-level steps, and a trace nests every tool call under `model_generation`.
import { Agent } from '@mastra/core/agent';
import { createScorer, extractTrajectoryFromTrace, type Trajectory, type TrajectoryStep } from '@mastra/core/evals';
import { Mastra } from '@mastra/core/mastra';
import { createTool } from '@mastra/core/tools';
import { analyzeToolFailures, checkTrajectoryBlacklist } from '@mastra/evals/scorers/utils';
import { z } from 'zod';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import { ReproSetupError } from '../shared/errors.ts';
import { flushTraces, observedStorage, requireStoredTrace, requireTraceId } from '../shared/observed-storage.ts';
import { scriptedModel, textTurn, toolCallTurn } from '../shared/scripted-model.ts';
import { lookupToolId, repeatedQuery, searchAgent, searchToolId } from '../shared/search-agent.ts';

const sampleEveryRun = { type: 'ratio', rate: 1 } as const;
const liveScoreSettleMilliseconds = 300;
const flakyToolId = 'flakySearch';
const forbiddenSequence = [searchToolId, lookupToolId];
const noRetriesAllowed = { maxRetriesPerTool: 0 };

/** Fails on its first call and succeeds on the next, so the agent's second call is a retry of a failed call. */
const failingOnceSearch = () => {
    const calls = { count: 0 };
    return createTool({
        id: flakyToolId,
        description: 'Search that fails once',
        inputSchema: z.object({ query: z.string() }),
        outputSchema: z.object({ hits: z.array(z.string()) }),
        execute: ({ query }) => {
            calls.count += 1;
            return calls.count === 1
                ? Promise.reject(new Error('search backend unavailable'))
                : Promise.resolve({ hits: [`doc-a:${query}`] });
        },
    });
};

const searchThenLookupScript = [
    toolCallTurn('call-1', searchToolId, repeatedQuery),
    toolCallTurn('call-2', lookupToolId, { sourceId: 'doc-a' }),
    textTurn('Canaries warned miners [doc-a].'),
];

const retryScript = [
    toolCallTurn('call-1', flakyToolId, repeatedQuery),
    toolCallTurn('call-2', flakyToolId, repeatedQuery),
    textTurn('Canaries warned miners [doc-a].'),
];

const liveTrajectories = new Map<string, Trajectory>();
const trajectoryRecorder = (agentId: string) =>
    createScorer({ id: `recorder-${agentId}`, description: 'Keeps the live trajectory', type: 'trajectory' })
        .preprocess(({ run }) => {
            liveTrajectories.set(agentId, run.output);
            return { steps: run.output.steps.length };
        })
        .generateScore(() => 1);
const recorded = (agentId: string) => ({
    [`recorder-${agentId}`]: { scorer: trajectoryRecorder(agentId), sampling: sampleEveryRun },
});

const toolCallCount = (steps: readonly TrajectoryStep[]): number =>
    steps.reduce(
        (count, step) => count + (step.stepType === 'tool_call' ? 1 : 0) + toolCallCount(step.children ?? []),
        0,
    );

const { storage, observability } = observedStorage({ serviceName: 'repro-trajectory-checks' });
const mastra = new Mastra({
    agents: {
        sequencer: searchAgent('sequencer', searchThenLookupScript, recorded('sequencer')),
        retrier: new Agent({
            id: 'retrier',
            name: 'retrier',
            instructions: 'Answer from the corpus.',
            model: scriptedModel('retrier-model', retryScript),
            tools: { [flakyToolId]: failingOnceSearch() },
            scorers: recorded('retrier'),
        }),
    },
    storage,
    observability,
});

const sequenced = await mastra.getAgent('sequencer').generate('What did canaries do?', { maxSteps: 5 });
const retried = await mastra.getAgent('retrier').generate('What did canaries do?', { maxSteps: 5 });
await new Promise((resolve) => setTimeout(resolve, liveScoreSettleMilliseconds));
await flushTraces(mastra);

const bothShapes = async (agentId: string, runResult: { readonly traceId?: string | undefined }) => {
    const messages = liveTrajectories.get(agentId);
    if (messages === undefined) {
        throw new ReproSetupError(`the live trajectory scorer never ran for ${agentId}`);
    }
    const trace = extractTrajectoryFromTrace((await requireStoredTrace(mastra, requireTraceId(runResult))).spans);
    return { messages, trace };
};

const sequencedShapes = await bothShapes('sequencer', sequenced);
const retriedShapes = await bothShapes('retrier', retried);

const sequenceCheck = (trajectory: Trajectory) => {
    const { score, violatedSequences } = checkTrajectoryBlacklist(trajectory, {
        blacklistedSequences: [forbiddenSequence],
    });
    return { score, violatedSequences };
};
const retryCheck = (trajectory: Trajectory) => {
    const { score, totalRetries, excessiveRetryTools } = analyzeToolFailures(trajectory, noRetriesAllowed);
    return { toolCallsInTrajectory: toolCallCount(trajectory.steps), score, totalRetries, excessiveRetryTools };
};

const sequenceOnMessages = sequenceCheck(sequencedShapes.messages);
const sequenceOnTrace = sequenceCheck(sequencedShapes.trace);
const retryOnMessages = retryCheck(retriedShapes.messages);
const retryOnTrace = retryCheck(retriedShapes.trace);

await reportOutcome(
    'trajectory-checks-on-trace',
    outcomeWhen(
        sequenceOnMessages.score === 0 &&
            sequenceOnTrace.score === 1 &&
            retryOnMessages.totalRetries > 0 &&
            retryOnTrace.totalRetries === 0,
        `blacklistedSequences [${forbiddenSequence.join(', ')}]: score ${sequenceOnMessages.score} on the message ` +
            `trajectory, ${sequenceOnTrace.score} on the trace trajectory of the same run; a retry after a failed ` +
            `${flakyToolId} call with maxRetriesPerTool 0: ${retryOnMessages.totalRetries} retry found on the ` +
            `message trajectory, ${retryOnTrace.totalRetries} on the trace trajectory`,
        {
            blacklistedSequences: { onMessages: sequenceOnMessages, onTrace: sequenceOnTrace },
            maxRetriesPerTool: { onMessages: retryOnMessages, onTrace: retryOnTrace },
        },
    ),
);
