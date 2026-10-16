// With storage configured, runEvals documents trace-based trajectory extraction as the
// preferred path, but it reads the trace right after `generate()` while the default storage exporter still
// buffers spans (up to 5 s), finds nothing, and silently falls back to the flat message trajectory.
import { mkdtempDisposable } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createScorer, runEvals, type Trajectory } from '@mastra/core/evals';
import { Mastra } from '@mastra/core/mastra';
import { InMemoryStore, type MastraCompositeStore } from '@mastra/core/storage';
import { LibSQLStore } from '@mastra/libsql';
import type { MastraStorageExporterConfig } from '@mastra/observability';

import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import { ReproSetupError } from '../shared/errors.ts';
import { flushTraces, loadTrace, observedStorage, requireTraceId } from '../shared/observed-storage.ts';
import { searchAgent } from '../shared/search-agent.ts';

type ExtractionPath = 'trace' | 'message-fallback';

type RunEvalsSetup = {
    readonly storageName: string;
    readonly storage: MastraCompositeStore;
    readonly exporterConfig: MastraStorageExporterConfig;
};

type RunEvalsObservation = {
    readonly storageName: string;
    readonly exporterConfig: MastraStorageExporterConfig;
    readonly extractionPath: ExtractionPath;
    readonly topLevelStepTypes: readonly string[];
    readonly traceStoredWhenRunEvalsReturned: boolean;
    readonly traceStoredAfterFlush: boolean;
};

/** Trace extraction nests tool calls under a `model_generation` step; message extraction is a flat tool list. */
const extractionPathOf = (trajectory: Trajectory): ExtractionPath =>
    trajectory.steps.some((step) => step.stepType === 'model_generation') ? 'trace' : 'message-fallback';

const observeRunEvals = async ({
    storageName,
    storage: store,
    exporterConfig,
}: RunEvalsSetup): Promise<RunEvalsObservation> => {
    const received: { readonly trajectory: Trajectory; readonly traceId: string | undefined }[] = [];
    const trajectoryProbe = createScorer({
        id: 'trajectory-probe',
        description: 'Keeps what runEvals passed',
        type: 'trajectory',
    })
        .preprocess(({ run }) => {
            received.push({ trajectory: run.output, traceId: run.targetTraceId });
            return { steps: run.output.steps.length };
        })
        .generateScore(() => 1);

    const { storage, observability } = observedStorage({
        serviceName: 'repro-run-evals',
        exporterConfig,
        storage: store,
    });
    const mastra = new Mastra({
        agents: { researcher: searchAgent('researcher') },
        scorers: { trajectoryProbe },
        storage,
        observability,
    });

    await runEvals({
        target: mastra.getAgent('researcher'),
        data: [{ input: 'What did canaries do?' }],
        scorers: { trajectory: [trajectoryProbe] },
        targetOptions: { maxSteps: 5 },
    });
    const [first] = received;
    if (first === undefined) {
        throw new ReproSetupError('runEvals never ran the trajectory probe');
    }
    const traceId = requireTraceId(first);
    const traceStoredWhenRunEvalsReturned = (await loadTrace(mastra, traceId)) !== null;
    await flushTraces(mastra);
    const { trajectory } = first;

    return {
        storageName,
        exporterConfig,
        extractionPath: extractionPathOf(trajectory),
        topLevelStepTypes: trajectory.steps.map((step) => step.stepType),
        traceStoredWhenRunEvalsReturned,
        traceStoredAfterFlush: (await loadTrace(mastra, traceId)) !== null,
    };
};

await using workspace = await mkdtempDisposable(join(tmpdir(), 'repro-run-evals-'));
const libsqlFile = new LibSQLStore({ id: 'repro-run-evals-libsql', url: `file:${join(workspace.path, 'mastra.db')}` });

const defaultExporter = await observeRunEvals({
    storageName: 'InMemoryStore',
    storage: new InMemoryStore(),
    exporterConfig: {},
});
const realtimeExporter = await observeRunEvals({
    storageName: 'InMemoryStore',
    storage: new InMemoryStore(),
    exporterConfig: { strategy: 'realtime' },
});
const libsqlDefaultExporter = await observeRunEvals({
    storageName: 'LibSQLStore (file)',
    storage: libsqlFile,
    exporterConfig: {},
});

await reportOutcome(
    'run-evals-trace-fallback',
    outcomeWhen(
        defaultExporter.extractionPath === 'message-fallback' &&
            defaultExporter.traceStoredAfterFlush &&
            realtimeExporter.extractionPath === 'trace',
        `default exporter: runEvals used the ${defaultExporter.extractionPath} trajectory although the trace exists ` +
            `once flushed; with strategy 'realtime' it used the ${realtimeExporter.extractionPath} trajectory; ` +
            `LibSQLStore with the default exporter: ${libsqlDefaultExporter.extractionPath}`,
        { defaultExporter, realtimeExporter, libsqlDefaultExporter },
    ),
);
