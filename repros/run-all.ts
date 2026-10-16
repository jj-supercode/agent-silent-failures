// `pnpm repros [id ...]`: runs each reproduction in its own Node process, offline, and reports one result per repro.
import { fileURLToPath } from 'node:url';

import { runCommand, type CommandOutput, type CommandReport } from '../src/command-output/index.ts';
import { reproductionIds } from './runner/reproduction-ids.ts';
import { reprosCommand, type ReprosOptions } from './runner/repros-command.ts';
import { progressOf, reprosHeader, reprosReport, resultTable } from './runner/repros-console.ts';
import { runReproduction, type ReproductionRun } from './runner/run-reproduction.ts';

const repositoryRoot = fileURLToPath(new URL('../', import.meta.url));

const runSelected = async (options: ReprosOptions, output: CommandOutput): Promise<readonly ReproductionRun[]> => {
    using tracker = output.trackProgress(options.reproductionIds.length, 'repros');
    // Sequential on purpose (`Array.fromAsync` awaits one at a time): the embedding repros each load the model.
    return await Array.fromAsync(options.reproductionIds, async (reproductionId) => {
        const run = await runReproduction(reproductionId);
        tracker.update(progressOf(run));
        return run;
    });
};

const runRepros = async (options: ReprosOptions, output: CommandOutput): Promise<CommandReport> => {
    output.start(reprosHeader(options.reproductionIds.length));
    const runs = await runSelected(options, output);
    output.section('Results', resultTable(runs, output.style));
    return reprosReport(runs, repositoryRoot);
};

const knownIds = await reproductionIds();
process.exitCode = await runCommand(reprosCommand(knownIds), process.argv.slice(2), runRepros);
