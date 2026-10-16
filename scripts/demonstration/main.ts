// `pnpm demonstration`: every Studio fault preset, driven offline through the scripted Studio agents, recorded as
// sanitized traces and scored offline from them. A rehearsal records to a temporary directory and writes nothing in
// the repository; `--write` records into fixtures/demonstration/scripted/<date>/ and rewrites
// results/demonstration/scripted.json and the docs. `--rescore` scores the newest committed recordings again.
import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { corpusFailure } from '../../src/bed/index.ts';
import { runCommand, stoppedReport, type CommandOutput, type CommandReport } from '../../src/command-output/index.ts';
import { loadQuestions, type CorpusQuestion } from '../../src/corpus/index.ts';
import { scriptedModelId } from '../../src/harness/index.ts';
import { guardedProcessEnvironment, manifestBase, recordingDate, startFixtureSet } from '../../src/record/index.ts';
import { demonstrationSummaryLines, plannedMatrixRuns } from '../../src/studio/demonstration/index.ts';
import { studioFaultPresetList, type StudioAgentModel } from '../../src/studio/index.ts';
import {
    demonstrationCommand,
    demonstrationExitCodes,
    type DemonstrationOptions,
    type RecordingAction,
} from './demonstration-command.ts';
import {
    differenceFailure,
    docsFailure,
    scriptedHeader,
    scriptedMatrixReport,
    unreadableFailure,
} from './demonstration-console.ts';
import { recordAndScore } from './record-and-score.ts';
import { renderDocs } from './render-docs.ts';
import { rescoreRecordings } from './rescore.ts';
import { demonstrationFixtureRoots, demonstrationResultFiles, writeDemonstrationReport } from './result-files.ts';

const scriptedModel: StudioAgentModel = { kind: 'scripted' };

/** A written recording is dated and committed; a rehearsal's goes to a fresh temporary directory. */
const recordingDirectory = async (action: RecordingAction, startedAt: Date): Promise<string> => {
    switch (action) {
        case 'write':
            return path.join(demonstrationFixtureRoots.scripted, recordingDate(startedAt));
        case 'rehearse':
            return mkdtemp(path.join(tmpdir(), 'agent-silent-failures-demonstration-'));
        default:
            return action satisfies never;
    }
};

/** After a result file changed: the docs rendered from it, or the report of why they could not be. */
const withRenderedDocs = async (report: CommandReport, output: CommandOutput): Promise<CommandReport> => {
    const rendered = await renderDocs();
    if (rendered.kind === 'failed') {
        output.failure(docsFailure(rendered.reason));
        return stoppedReport(demonstrationExitCodes.unexpectedError, 'the results were written, the docs were not');
    }
    return report;
};

const recordScripted = async (
    corpus: readonly CorpusQuestion[],
    action: RecordingAction,
    output: CommandOutput,
): Promise<CommandReport> => {
    const startedAt = new Date();
    const directory = await recordingDirectory(action, startedAt);
    output.start(scriptedHeader(directory, action));
    // The scripted recording is free to regenerate, so a second run on the same day replaces it.
    await startFixtureSet(directory, { replace: true });
    using progress = output.trackProgress(studioFaultPresetList.length, 'presets');
    const session = await recordAndScore({
        corpus,
        model: scriptedModel,
        recording: {
            directory,
            environment: guardedProcessEnvironment(),
            manifestBase: await manifestBase({
                mode: 'dry-run',
                models: { agentModelId: scriptedModelId, judgeModelId: null },
                startedAt,
                split: 'held-out',
                plannedRuns: plannedMatrixRuns(scriptedModel, corpus),
            }),
        },
        onPresetDone: () => progress.update({ kind: 'done', spendUsd: null }),
        spend: () => null,
    });
    if (session.kind === 'unreadable') {
        output.failure(unreadableFailure(session));
        return stoppedReport(demonstrationExitCodes.unexpectedError, 'the recording just written cannot be read back');
    }
    session.differences.forEach((preset) => output.failure(differenceFailure(preset)));
    output.section('Presets', demonstrationSummaryLines(session.report));
    const report = scriptedMatrixReport({
        report: session.report,
        differences: session.differences,
        directory,
        action,
    });
    if (action === 'rehearse') {
        return report;
    }
    await writeDemonstrationReport(demonstrationResultFiles.scripted, session.report);
    return withRenderedDocs(report, output);
};

const rescoreAndRender = async (corpus: readonly CorpusQuestion[], output: CommandOutput): Promise<CommandReport> => {
    const report = await rescoreRecordings(corpus, output);
    return report.exit === demonstrationExitCodes.noRecording ? report : withRenderedDocs(report, output);
};

const runDemonstration = async (options: DemonstrationOptions, output: CommandOutput): Promise<CommandReport> => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        output.failure(corpusFailure(loaded.failure));
        return stoppedReport(demonstrationExitCodes.corpusUnreadable, 'cannot read the question corpus');
    }
    return options.action === 'rescore'
        ? rescoreAndRender(loaded.questions, output)
        : recordScripted(loaded.questions, options.action, output);
};

process.exitCode = await runCommand(demonstrationCommand, process.argv.slice(2), runDemonstration);
