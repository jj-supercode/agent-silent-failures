import { fileURLToPath } from 'node:url';

import {
    displayPath,
    runCommand,
    stoppedReport,
    type CommandOutput,
    type CommandReport,
} from '../../command-output/index.ts';
import { loadQuestions } from '../../corpus/index.ts';
import { corpusFailure } from '../console/corpus-failure.ts';
import { detectorTableLines } from '../console/detector-table.ts';
import { runBedWithProgress } from '../console/run-progress.ts';
import { detailLines, scoredRunsReport } from '../console/scored-runs-report.ts';
import { writeRequestedOutputs } from '../output/requested-outputs.ts';
import { splitTitle } from '../render/markdown-report.ts';
import { summarize } from '../summary/summarize.ts';
import { bedCommand } from './bed-command.ts';
import { bedHeader, bedNextSteps } from './bed-console.ts';
import { bedExitCodes } from './bed-exit-codes.ts';
import type { BedOptions } from './bed-options.ts';
import { plannedSpecs, reportedRuns } from './bed-scope.ts';
import { currentProvenance } from './provenance.ts';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

const runBedCommand = async (options: BedOptions, output: CommandOutput): Promise<CommandReport> => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        output.failure(corpusFailure(loaded.failure));
        return stoppedReport(bedExitCodes.corpusUnreadable, 'cannot read the question corpus');
    }
    const specs = plannedSpecs(options, loaded.questions);
    output.start(bedHeader(options, specs.length));
    const outcome = await runBedWithProgress(specs, output);
    const report = summarize(reportedRuns(outcome.runs, options.entryId));
    report.splits.forEach((split) => output.section(splitTitle(split), detectorTableLines(split, output.style)));
    if (options.details) {
        output.section('Details', detailLines(report));
    }
    const complete = outcome.failures.length === 0;
    if (options.writeResults && !complete) {
        output.warning('runs failed, so results/offline/ was not rewritten', []);
    }
    const written = await writeRequestedOutputs(
        options,
        report,
        await currentProvenance('scripted', new Date()),
        complete,
    );
    return scoredRunsReport({
        plannedRuns: specs.length,
        outcome,
        report,
        outputs: written.map((path) => displayPath(repositoryRoot, path)),
        next: bedNextSteps(options, options.writeResults && complete),
    });
};

process.exitCode = await runCommand(bedCommand, process.argv.slice(2), runBedCommand);
