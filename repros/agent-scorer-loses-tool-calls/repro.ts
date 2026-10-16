// A `type: 'agent'` scorer sees every tool call when attached live, but 0 tool calls
// when the same scorer scores the stored trace (Studio trace scoring), with no error.
import { createScorer } from '@mastra/core/evals';
import { Mastra } from '@mastra/core/mastra';
import { SpanType } from '@mastra/core/observability';
import { createToolCallAccuracyScorerCode } from '@mastra/evals/scorers/prebuilt';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import { ReproSetupError } from '../shared/errors.ts';
import { flushTraces, observedStorage, requireStoredTrace, requireTraceId } from '../shared/observed-storage.ts';
import { parentTypeOf, spansOfType } from '../shared/trace-queries.ts';
import { repeatedSearchScript, searchToolId, searchAgent } from '../shared/search-agent.ts';
import { scoreStoredTrace } from '../shared/trace-scoring.ts';

const sampleEveryRun = { type: 'ratio', rate: 1 } as const;
const liveScoreSettleMilliseconds = 300;

const toolCallCounter = createScorer({
    id: 'tool-call-counter',
    description: 'Scores the number of tool invocations the scorer receives',
    type: 'agent',
})
    .preprocess(({ run }) => ({
        toolNames: run.output.flatMap((message) => message.content.toolInvocations ?? []).map((call) => call.toolName),
    }))
    .generateScore(({ results }) => results.preprocessStepResult.toolNames.length);

const builtInToolCallAccuracy = createToolCallAccuracyScorerCode({ expectedTool: searchToolId });

const liveScores: number[] = [];
const liveRecorder = createScorer({ id: 'live-recorder', description: 'Records live tool call counts', type: 'agent' })
    .preprocess(({ run }) => ({
        toolCalls: run.output.flatMap((message) => message.content.toolInvocations ?? []).length,
    }))
    .generateScore(({ results }) => {
        liveScores.push(results.preprocessStepResult.toolCalls);
        return results.preprocessStepResult.toolCalls;
    });

const { storage, observability } = observedStorage({ serviceName: 'repro-agent-scorer' });
const mastra = new Mastra({
    agents: {
        researcher: searchAgent('researcher', repeatedSearchScript, {
            liveRecorder: { scorer: liveRecorder, sampling: sampleEveryRun },
            builtInToolCallAccuracy: { scorer: builtInToolCallAccuracy, sampling: sampleEveryRun },
        }),
    },
    scorers: { toolCallCounter, builtInToolCallAccuracy },
    storage,
    observability,
});

const result = await mastra.getAgent('researcher').generate('What did canaries do?', { maxSteps: 5 });
await new Promise((resolve) => setTimeout(resolve, liveScoreSettleMilliseconds));
await flushTraces(mastra);

const traceId = requireTraceId(result);
const trace = await requireStoredTrace(mastra, traceId);
const toolSpans = spansOfType(trace, SpanType.TOOL_CALL);
const traceScoring = await scoreStoredTrace(storage, mastra.getScorerById('tool-call-counter'), traceId);

const builtInOnTrace = await scoreStoredTrace(storage, mastra.getScorerById(builtInToolCallAccuracy.id), traceId);
const scoresStore = await storage.getStore('scores');
const builtInLiveScores = await scoresStore?.listScoresByScorerId({
    scorerId: builtInToolCallAccuracy.id,
    pagination: { page: 0, perPage: 10 },
});

const [liveToolCalls] = liveScores;
if (liveToolCalls === undefined) {
    throw new ReproSetupError('the live agent scorer never ran');
}
const traceToolCalls = traceScoring.kind === 'scored' ? traceScoring.score : -1;

await reportOutcome(
    'agent-scorer-loses-tool-calls',
    outcomeWhen(
        toolSpans.length > 0 && liveToolCalls === toolSpans.length && traceToolCalls === 0,
        `type 'agent' scorer: ${liveToolCalls} tool calls live, ${traceToolCalls} when scoring the stored trace ` +
            `that holds ${toolSpans.length} tool_call spans`,
        {
            agentToolCallsReturnedByGenerate: result.toolCalls.length,
            liveScorerToolInvocations: liveToolCalls,
            storedTraceToolCallSpans: toolSpans.length,
            storedToolCallSpanParents: toolSpans.map((span) => parentTypeOf(trace, span)),
            traceScoringResult: traceScoring,
            builtInToolCallAccuracy: {
                expectedTool: searchToolId,
                live: builtInLiveScores?.scores.map((score) => ({ source: score.source, score: score.score })) ?? [],
                traceScoring: builtInOnTrace,
            },
        },
    ),
);
