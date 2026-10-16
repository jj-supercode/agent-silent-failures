// Trajectory accuracy and the step budget read only the top-level steps, and a trace-derived trajectory nests every
// tool call under `model_generation`. On the trace trajectory of a run that makes exactly the expected calls,
// `compareTrajectories` scores 0 in every ordering, Mastra's `createTrajectoryScorerCode` scores the run 0, and
// `maxSteps` counts one step; on the message trajectory of the same run both are right.
import { createScorer, extractTrajectoryFromTrace, type Trajectory } from '@mastra/core/evals';
import { Mastra } from '@mastra/core/mastra';
import { createTrajectoryScorerCode } from '@mastra/evals/scorers/prebuilt';
import { checkTrajectoryEfficiency, compareTrajectories } from '@mastra/evals/scorers/utils';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import { ReproSetupError } from '../shared/errors.ts';
import { flushTraces, observedStorage, requireStoredTrace, requireTraceId } from '../shared/observed-storage.ts';
import { textTurn, toolCallTurn } from '../shared/scripted-model.ts';
import { lookupToolId, repeatedQuery, searchAgent, searchToolId } from '../shared/search-agent.ts';

const sampleEveryRun = { type: 'ratio', rate: 1 } as const;
const liveScoreSettleMilliseconds = 300;
const orderings = ['strict', 'relaxed', 'unordered'] as const;
/** One step fewer than the run takes, so the budget is exceeded on any trajectory that counts the tool calls. */
const stepBudget = { maxSteps: 1 };

const searchThenLookupScript = [
    toolCallTurn('call-1', searchToolId, repeatedQuery),
    toolCallTurn('call-2', lookupToolId, { sourceId: 'doc-a' }),
    textTurn('Canaries warned miners [doc-a].'),
];
const expectedSteps = [
    { stepType: 'tool_call', name: searchToolId },
    { stepType: 'tool_call', name: lookupToolId },
] as const;

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

/** The trajectory scorer reads only `run.output`; its agent input stays empty. */
const emptyAgentInput = { inputMessages: [], rememberedMessages: [], systemMessages: [], taggedSystemMessages: {} };

const accuracyScorer = createTrajectoryScorerCode({ defaults: { steps: [...expectedSteps], ordering: 'strict' } });

const { storage, observability } = observedStorage({ serviceName: 'repro-trajectory-accuracy' });
const mastra = new Mastra({
    agents: {
        sequencer: searchAgent('sequencer', searchThenLookupScript, {
            trajectoryRecorder: { scorer: trajectoryRecorder, sampling: sampleEveryRun },
        }),
    },
    storage,
    observability,
});

const run = await mastra.getAgent('sequencer').generate('What did canaries do?', { maxSteps: 5 });
await new Promise((resolve) => setTimeout(resolve, liveScoreSettleMilliseconds));
await flushTraces(mastra);

const [messageTrajectory] = liveTrajectories;
if (messageTrajectory === undefined) {
    throw new ReproSetupError('the live trajectory scorer never ran');
}
const traceTrajectory = extractTrajectoryFromTrace((await requireStoredTrace(mastra, requireTraceId(run))).spans);

const observe = async (trajectory: Trajectory) => {
    const { totalSteps, overStepBudget } = checkTrajectoryEfficiency(trajectory, {
        ...stepBudget,
        noRedundantCalls: false,
    });
    const scored = await accuracyScorer.run({ input: emptyAgentInput, output: trajectory });
    return {
        topLevelStepTypes: trajectory.steps.map((step) => step.stepType),
        accuracyByOrdering: Object.fromEntries(
            orderings.map((ordering) => [
                ordering,
                compareTrajectories(trajectory, { steps: [...expectedSteps] }, { ordering }).score,
            ]),
        ),
        trajectoryScorerScore: scored.score,
        stepBudget: { ...stepBudget, totalSteps, overStepBudget },
    };
};

const onMessages = await observe(messageTrajectory);
const onTrace = await observe(traceTrajectory);
const scoredZeroEverywhere = Object.values(onTrace.accuracyByOrdering).every((score) => score === 0);

await reportOutcome(
    'trajectory-accuracy-on-trace',
    outcomeWhen(
        onMessages.trajectoryScorerScore === 1 &&
            onTrace.trajectoryScorerScore === 0 &&
            scoredZeroEverywhere &&
            onMessages.stepBudget.overStepBudget &&
            !onTrace.stepBudget.overStepBudget,
        `a run making exactly the expected ${searchToolId}, ${lookupToolId} calls: createTrajectoryScorerCode scores ` +
            `${onMessages.trajectoryScorerScore} on the message trajectory and ${onTrace.trajectoryScorerScore} on the ` +
            `trace trajectory (accuracy 0 in every ordering); maxSteps ${stepBudget.maxSteps} counts ` +
            `${onMessages.stepBudget.totalSteps} steps on messages, ${onTrace.stepBudget.totalSteps} on the trace`,
        { onMessages, onTrace },
    ),
);
