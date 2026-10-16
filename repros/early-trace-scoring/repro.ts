// Studio's trace scoring (`POST /observability/traces/score` -> `scoreTraces`) answers
// "success" and scores asynchronously. When the trace is not stored yet, the "Trace not found" error goes only to
// `logger.trackException`, which the default ConsoleLogger never prints: no score row, no console line, no error.
// A scorer that throws, by contrast, is printed by the workflow engine (reported as a control).
import { createScorer } from '@mastra/core/evals';
import { scoreTraces, scoreTracesWorkflow } from '@mastra/core/evals/scoreTraces';
import { Mastra } from '@mastra/core/mastra';
import { Workflow } from '@mastra/core/workflows';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import { captureConsole, firstLines } from '../shared/console-capture.ts';
import { flushTraces, loadTrace, observedStorage, requireTraceId } from '../shared/observed-storage.ts';
import { searchAgent } from '../shared/search-agent.ts';
import { ControlScorerError, ReproSetupError } from '../shared/errors.ts';

const scoringSettleMilliseconds = 1000;

const traceLoaded = createScorer({ id: 'trace-loaded', description: 'Always scores 1' }).generateScore(() => 1);
const throwingScorer = createScorer({ id: 'throwing-scorer', description: 'Throws while scoring' }).generateScore(
    () => {
        throw new ControlScorerError('scorer bug');
    },
);

const { storage, observability } = observedStorage({ serviceName: 'repro-early-scoring' });
const mastra = new Mastra({
    agents: { researcher: searchAgent('researcher') },
    scorers: { traceLoaded, throwingScorer },
    storage,
    observability,
});
// Mirrors `mastra dev`: mastra@1.34.1 dist/templates/dev.entry.js:13-15 registers this workflow when storage exists.
// The published declaration of scoreTracesWorkflow imports an extensionless path that NodeNext cannot resolve, so
// its static type is lost; the runtime check restores it.
const traceScoringWorkflow: unknown = scoreTracesWorkflow;
if (!(traceScoringWorkflow instanceof Workflow)) {
    throw new ReproSetupError('scoreTracesWorkflow is no longer a Workflow');
}
mastra.__registerInternalWorkflow(traceScoringWorkflow);
await mastra.startWorkers();

const persistedScores = async (scorerId: string): Promise<number> => {
    const scoresStore = await storage.getStore('scores');
    const listed = await scoresStore?.listScoresByScorerId({ scorerId, pagination: { page: 0, perPage: 10 } });
    return listed?.scores.length ?? 0;
};

const scoreLikeStudio = async (scorerId: string, traceId: string) => {
    using output = captureConsole();
    const settled = await scoreTraces({ scorerId, targets: [{ traceId }], mastra }).then(
        () => 'resolved',
        (error: unknown) => `rejected: ${String(error)}`,
    );
    await new Promise((resolve) => setTimeout(resolve, scoringSettleMilliseconds));
    return { settled, consoleLines: firstLines(output) };
};

const result = await mastra.getAgent('researcher').generate('What did canaries do?', { maxSteps: 5 });
const traceId = requireTraceId(result);

const traceStoredBeforeScoring = (await loadTrace(mastra, traceId)) !== null;
const early = await scoreLikeStudio('trace-loaded', traceId);
const scoresAfterEarlyCall = await persistedScores('trace-loaded');

await flushTraces(mastra);
const late = await scoreLikeStudio('trace-loaded', traceId);
const scoresAfterLateCall = await persistedScores('trace-loaded');

const throwing = await scoreLikeStudio('throwing-scorer', traceId);
const throwingScores = await persistedScores('throwing-scorer');
await mastra.stopWorkers();

await reportOutcome(
    'early-trace-scoring',
    outcomeWhen(
        !traceStoredBeforeScoring &&
            early.settled === 'resolved' &&
            scoresAfterEarlyCall === 0 &&
            early.consoleLines.length === 0 &&
            scoresAfterLateCall === 1,
        `scoring before the trace is stored resolves, writes ${scoresAfterEarlyCall} scores and prints ` +
            `${early.consoleLines.length} console lines; the same call after a flush writes ${scoresAfterLateCall}`,
        {
            beforeFlush: { traceStoredBeforeScoring, ...early, persistedScores: scoresAfterEarlyCall },
            afterFlush: { ...late, persistedScores: scoresAfterLateCall },
            scorerThatThrows: { ...throwing, persistedScores: throwingScores },
        },
    ),
);
