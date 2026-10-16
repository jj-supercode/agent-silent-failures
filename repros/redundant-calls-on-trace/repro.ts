// `checkTrajectoryEfficiency({ noRedundantCalls: true })` flags two consecutive identical
// tool calls on the message-derived trajectory but not on the trace-derived trajectory of the same run: in the
// trace, Mastra's own request-processor steps (`processor_run`) sit between the two `tool_call` siblings.
import { createScorer, extractTrajectoryFromTrace, type Trajectory, type TrajectoryStep } from '@mastra/core/evals';
import { Mastra } from '@mastra/core/mastra';
import { checkTrajectoryEfficiency } from '@mastra/evals/scorers/utils';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import { ReproSetupError } from '../shared/errors.ts';
import { flushTraces, observedStorage, requireStoredTrace, requireTraceId } from '../shared/observed-storage.ts';
import {
    lookupToolId,
    repeatedQuery,
    repeatedSearchScript,
    searchToolId,
    searchAgent,
} from '../shared/search-agent.ts';
import { textTurn, toolCallTurn } from '../shared/scripted-model.ts';

const sampleEveryRun = { type: 'ratio', rate: 1 } as const;
const liveScoreSettleMilliseconds = 300;

/** Repeat with a different tool in between: outside the documented "consecutive" scope, reported for context. */
const interleavedRepeatScript = [
    toolCallTurn('call-1', searchToolId, repeatedQuery),
    toolCallTurn('call-2', lookupToolId, { sourceId: 'doc-a' }),
    toolCallTurn('call-3', searchToolId, repeatedQuery),
    textTurn('Canaries warned miners [doc-a].'),
];

const liveTrajectories: Trajectory[] = [];
const trajectoryRecorder = createScorer({
    id: 'trajectory-recorder',
    description: 'Keeps the live trajectory',
    type: 'trajectory',
})
    .preprocess(({ run }) => {
        liveTrajectories.push(run.output);
        return { steps: run.output.steps.length };
    })
    .generateScore(() => 1);

const outline = (steps: readonly TrajectoryStep[], depth = 0): readonly string[] =>
    steps.flatMap((step) => [
        `${'  '.repeat(depth)}${step.stepType}:${step.name}`,
        ...outline(step.children ?? [], depth + 1),
    ]);

const redundantCallsIn = (trajectory: Trajectory) =>
    checkTrajectoryEfficiency(trajectory, { noRedundantCalls: true }).redundantCalls;

const { storage, observability } = observedStorage({ serviceName: 'repro-redundant-calls' });
const mastra = new Mastra({
    agents: {
        repeater: searchAgent('repeater', repeatedSearchScript, {
            trajectoryRecorder: { scorer: trajectoryRecorder, sampling: sampleEveryRun },
        }),
        interleaver: searchAgent('interleaver', interleavedRepeatScript),
    },
    storage,
    observability,
});

const repeated = await mastra.getAgent('repeater').generate('What did canaries do?', { maxSteps: 5 });
const interleaved = await mastra.getAgent('interleaver').generate('What did canaries do?', { maxSteps: 6 });
await new Promise((resolve) => setTimeout(resolve, liveScoreSettleMilliseconds));
await flushTraces(mastra);

const repeatedTrace = await requireStoredTrace(mastra, requireTraceId(repeated));
const interleavedTrace = await requireStoredTrace(mastra, requireTraceId(interleaved));
const traceTrajectory = extractTrajectoryFromTrace(repeatedTrace.spans);
const [messageTrajectory] = liveTrajectories;
if (messageTrajectory === undefined) {
    throw new ReproSetupError('the live trajectory scorer never ran');
}
const interleavedTrajectory = extractTrajectoryFromTrace(interleavedTrace.spans);

const onMessages = redundantCallsIn(messageTrajectory);
const onTrace = redundantCallsIn(traceTrajectory);

await reportOutcome(
    'redundant-calls-on-trace',
    outcomeWhen(
        onMessages.length > 0 && onTrace.length === 0,
        `two consecutive identical ${searchToolId} calls: redundantCalls has ${onMessages.length} entry on the ` +
            `message trajectory, ${onTrace.length} on the trace trajectory of the same run`,
        {
            messageTrajectory: { outline: outline(messageTrajectory.steps), redundantCalls: onMessages },
            traceTrajectory: { outline: outline(traceTrajectory.steps), redundantCalls: onTrace },
            outOfDocumentedScope: {
                script: `${searchToolId}, ${lookupToolId}, ${searchToolId} (identical args)`,
                redundantCallsOnTrace: redundantCallsIn(interleavedTrajectory),
            },
        },
    ),
);
