import { corpusFailure, detectorTableLines, renderSummary, splitTitle, summarize } from '../bed/index.ts';
import {
    displayPath,
    runCommand,
    stoppedReport,
    type CommandOutput,
    type CommandReport,
} from '../command-output/index.ts';
import { loadQuestions } from '../corpus/index.ts';
import { corpusSha256 } from '../record/index.ts';
import { findFixtureSet } from './fixture-lookup.ts';
import { replayCommand, replayExitCodes } from './replay-command.ts';
import { replayHeader, replayReport, reportProblems, scopeNotes } from './replay-console.ts';
import { replayFixtures } from './replay-fixtures.ts';
import type { ReplayOptions } from './replay-options.ts';
import { renderReplayNotes } from './replay-report.ts';
import { defaultReplayOutputDirectory, repositoryRoot } from './repository-paths.ts';
import { writeReplayReports } from './write-replay-reports.ts';

const runReplay = async (options: ReplayOptions, output: CommandOutput): Promise<CommandReport> => {
    const lookup = await findFixtureSet(options.fixtureDirectory);
    if (lookup.kind === 'missing') {
        output.failure({ subject: null, what: 'no fixture set to replay', why: lookup.why, fix: lookup.fix });
        return stoppedReport(replayExitCodes.noFixtureSet, 'no fixture set to replay');
    }
    const { fixtures } = lookup;
    const { manifest } = fixtures;
    const fixtureName = displayPath(repositoryRoot, fixtures.directory);
    const corpus = await loadQuestions();
    if (corpus.kind === 'failed') {
        output.failure(corpusFailure(corpus.failure));
        return stoppedReport(replayExitCodes.corpusUnreadable, 'cannot read the question corpus');
    }
    const corpusHash = await corpusSha256();
    if (corpusHash !== manifest.corpusSha256) {
        output.failure({
            subject: fixtureName,
            what: 'fixture set recorded on another corpus',
            why: `recorded on sha256 ${manifest.corpusSha256}, the corpus is now ${corpusHash}: gold answers and run labels would not match`,
            fix: 're-record it with pnpm demo:live, or restore the corpus it was recorded on',
        });
        return stoppedReport(replayExitCodes.corpusMismatch, 'fixture set recorded on another corpus');
    }
    output.start(replayHeader(fixtureName, manifest));
    const result = replayFixtures(fixtures, corpus.questions);
    const report = summarize(result.scored);
    reportProblems(result, output);
    report.splits.forEach((split) =>
        output.section(splitTitle(split), [...detectorTableLines(split, output.style), '', ...scopeNotes(report)]),
    );
    if (options.details) {
        const notes = renderReplayNotes(manifest, result, report, fixtureName);
        output.section('Details', `${notes}\n${report.splits.map(renderSummary).join('\n\n')}`.split('\n'));
    }
    const outputs = await writeReplayReports(
        options.outputDirectory ?? defaultReplayOutputDirectory,
        fixtureName,
        fixtures,
        result,
        report,
    );
    return replayReport({ options, manifest, result, report, outputs });
};

process.exitCode = await runCommand(replayCommand, process.argv.slice(2), runReplay);
