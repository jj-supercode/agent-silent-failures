// `pnpm demonstration:live`: the Studio fault matrix with every agent on Claude Haiku 5.5, behind the Studio spend
// cap (STUDIO_LIVE_MAX_USD, default USD 1). For the owner only: it reads the key from .env through the live module.
// Every trace is recorded, sanitized, in fixtures/demonstration/live/<date>/, and the matrix is scored offline from that
// recording, so `pnpm demonstration --rescore` regenerates it without a model call. `--dry-run` runs the same path
// with a scripted stand-in model: no key, no network, no cost.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { corpusFailure } from '../../src/bed/index.ts';
import {
    displayPath,
    runCommand,
    stoppedReport,
    type CommandOutput,
    type CommandReport,
} from '../../src/command-output/index.ts';
import { loadQuestions, type CorpusQuestion } from '../../src/corpus/index.ts';
import { usdSchema } from '../../src/live/budget/model.ts';
import type { StudioSpend } from '../../src/live/studio/studio-spend.ts';
import { guardedProcessEnvironment, manifestBase, recordingDate, startFixtureSet } from '../../src/record/index.ts';
import {
    demonstrationSummaryLines,
    plannedMatrixRuns,
    type DemonstrationSpend,
} from '../../src/studio/demonstration/index.ts';
import { studioFaultPresetList, type StudioAgentModel } from '../../src/studio/index.ts';
import { demonstrationLiveCommand, demonstrationLiveExitCodes, type DemonstrationLiveOptions } from './live-command.ts';
import { unreadableFailure } from './demonstration-console.ts';
import {
    billedUsd,
    differencesWarning,
    existingRecordingFailure,
    liveMatrixHeader,
    liveMatrixReport,
} from './live-console.ts';
import { dryRunModel, liveModel, type ReadyMatrixModel } from './matrix-model.ts';
import { recordAndScore } from './record-and-score.ts';
import { demonstrationFixtureRoots, demonstrationResultFiles, writeDemonstrationReport } from './result-files.ts';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

const outputFile = (options: DemonstrationLiveOptions): string | null =>
    options.out ?? (options.mode === 'live' ? demonstrationResultFiles.live : null);

/** A live recording is dated and committed; a dry run's goes to a fresh temporary directory unless one is named. */
const fixtureDirectory = async (options: DemonstrationLiveOptions, startedAt: Date): Promise<string> =>
    options.fixtures ??
    (options.mode === 'live'
        ? path.join(demonstrationFixtureRoots.live, recordingDate(startedAt))
        : await mkdtemp(path.join(tmpdir(), 'agent-silent-failures-demonstration-')));

type MatrixSession = {
    readonly corpus: readonly CorpusQuestion[];
    readonly model: ReadyMatrixModel;
    /** The session's spend so far, as the guard last reported it. */
    readonly spentSoFar: () => DemonstrationSpend;
};

const recordMatrix = async (
    options: DemonstrationLiveOptions,
    output: CommandOutput,
    { corpus, model, spentSoFar }: MatrixSession,
): Promise<CommandReport> => {
    const startedAt = new Date();
    const directory = await fixtureDirectory(options, startedAt);
    const started = await startFixtureSet(directory, { replace: options.mode === 'dry-run' });
    if (started.kind === 'exists') {
        output.failure(existingRecordingFailure(directory));
        return stoppedReport(demonstrationLiveExitCodes.fixturesExist, 'a recording already exists; nothing was sent');
    }
    output.start(liveMatrixHeader(options, model, directory));
    const agentModel: StudioAgentModel = { kind: 'live', model: model.model };
    using progress = output.trackProgress(studioFaultPresetList.length, 'presets');
    const session = await recordAndScore({
        corpus,
        model: agentModel,
        recording: {
            directory,
            environment: guardedProcessEnvironment(),
            manifestBase: await manifestBase({
                mode: options.mode,
                models: { agentModelId: model.agentModel, judgeModelId: null },
                startedAt,
                split: 'held-out',
                plannedRuns: plannedMatrixRuns(agentModel, corpus),
            }),
        },
        onPresetDone: () =>
            progress.update({ kind: 'done', spendUsd: billedUsd(options, usdSchema.parse(spentSoFar().usd)) }),
        spend: spentSoFar,
    });
    if (session.kind === 'unreadable') {
        output.failure(unreadableFailure(session));
        return stoppedReport(
            demonstrationLiveExitCodes.unexpectedError,
            `the recording was written to ${displayPath(repositoryRoot, directory)} but cannot be read back`,
        );
    }
    if (session.differences.length > 0) {
        output.warning(differencesWarning, session.differences);
    }
    output.section('Presets', demonstrationSummaryLines(session.report));
    const matrixFile = outputFile(options);
    if (matrixFile !== null) {
        await writeDemonstrationReport(matrixFile, session.report);
    }
    return liveMatrixReport({
        options,
        report: session.report,
        differences: session.differences,
        spend: spentSoFar(),
        directory,
        matrixFile,
    });
};

const runLiveDemonstration = async (
    options: DemonstrationLiveOptions,
    output: CommandOutput,
): Promise<CommandReport> => {
    const corpus = await loadQuestions();
    if (corpus.kind === 'failed') {
        output.failure(corpusFailure(corpus.failure));
        return stoppedReport(demonstrationLiveExitCodes.corpusUnreadable, 'cannot read the question corpus');
    }
    // The guard reports every settled call; the latest report is the session's spend so far, held at this edge.
    let latestSpend: StudioSpend | null = null;
    const onSpend = (spend: StudioSpend) => {
        latestSpend = spend;
    };
    const spentSoFar = (): DemonstrationSpend => ({
        usd: latestSpend?.spend.spent ?? usdSchema.parse(0),
        modelCalls: latestSpend?.spend.callCount ?? 0,
    });
    const model =
        options.mode === 'dry-run' ? dryRunModel(process.env, onSpend) : await liveModel(process.env, onSpend);
    if (model.kind === 'refused') {
        output.failure({ subject: null, what: 'refused to start; nothing was sent', why: model.reason, fix: null });
        return stoppedReport(model.exit, 'refused to start; nothing was sent');
    }
    return recordMatrix(options, output, { corpus: corpus.questions, model, spentSoFar });
};

process.exitCode = await runCommand(demonstrationLiveCommand, process.argv.slice(2), runLiveDemonstration);
