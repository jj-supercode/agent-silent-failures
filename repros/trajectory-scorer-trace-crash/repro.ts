// A `type: 'trajectory'` scorer is typed to receive a Trajectory, and runEvals and live
// scoring hand it one, but trace scoring hands it the root span's output, so the documented
// `run.output.steps` access throws.
import { createScorer, extractTrajectoryFromTrace } from '@mastra/core/evals';
import { Mastra } from '@mastra/core/mastra';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import { flushTraces, observedStorage, requireStoredTrace, requireTraceId } from '../shared/observed-storage.ts';
import { searchAgent } from '../shared/search-agent.ts';
import { rootSpanOf } from '../shared/trace-queries.ts';
import { scoreStoredTrace } from '../shared/trace-scoring.ts';

const emptyAgentInput = { inputMessages: [], rememberedMessages: [], systemMessages: [], taggedSystemMessages: {} };

const stepCounter = createScorer({
    id: 'trajectory-step-counter',
    description: 'Counts top-level trajectory steps',
    type: 'trajectory',
})
    .preprocess(({ run }) => ({ stepTypes: run.output.steps.map((step) => step.stepType) }))
    .generateScore(({ results }) => results.preprocessStepResult.stepTypes.length);

const { storage, observability } = observedStorage({ serviceName: 'repro-trajectory-scorer' });
const mastra = new Mastra({
    agents: { researcher: searchAgent('researcher') },
    scorers: { stepCounter },
    storage,
    observability,
});

const result = await mastra.getAgent('researcher').generate('What did canaries do?', { maxSteps: 5 });
await flushTraces(mastra);
const traceId = requireTraceId(result);
const trace = await requireStoredTrace(mastra, traceId);

const traceScoring = await scoreStoredTrace(storage, mastra.getScorerById('trajectory-step-counter'), traceId);
const directRunWithExtractedTrajectory = await stepCounter.run({
    input: emptyAgentInput,
    output: extractTrajectoryFromTrace(trace.spans),
});
const rootSpan = rootSpanOf(trace);

await reportOutcome(
    'trajectory-scorer-trace-crash',
    outcomeWhen(
        traceScoring.kind === 'failed',
        `type 'trajectory' scorer under trace scoring: ${traceScoring.kind === 'failed' ? traceScoring.message : traceScoring.kind}; ` +
            `the same scorer on extractTrajectoryFromTrace(spans) scores ${directRunWithExtractedTrajectory.score}`,
        {
            traceScoringResult: traceScoring,
            whatTheScorerReceivedAsOutput: {
                rootSpanType: rootSpan?.spanType,
                rootSpanOutputKeys:
                    typeof rootSpan?.output === 'object' && rootSpan.output !== null
                        ? Object.keys(rootSpan.output)
                        : [],
            },
            sameScorerOnExtractedTrajectory: directRunWithExtractedTrajectory?.score,
        },
    ),
);
