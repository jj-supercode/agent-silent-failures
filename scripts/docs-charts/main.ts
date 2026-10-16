// `pnpm docs:charts` renders the README charts from the committed result files, one SVG per chart and theme.
// `pnpm docs:charts --check` writes nothing and exits 1 when a chart is out of date.
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
    runCommand,
    stoppedReport,
    type CommandFailure,
    type CommandOutput,
    type CommandReport,
} from '../../src/command-output/index.ts';
import { collectInputs } from '../docs-tables/index.ts';
import { chartFiles, type ChartFile } from './charts.ts';
import { docsChartsCommand, docsChartsExitCodes, type DocsChartsOptions } from './docs-charts-command.ts';

const repositoryRoot = new URL('../../', import.meta.url);

type ChartOutcome = { readonly kind: 'current' | 'written' | 'stale'; readonly path: string };

const readIfPresent = (path: string): Promise<string | null> =>
    readFile(path, 'utf8').then(
        (content) => content,
        () => null,
    );

const renderFile = async (file: ChartFile, check: boolean): Promise<ChartOutcome> => {
    const path = fileURLToPath(new URL(file.path, repositoryRoot));
    if ((await readIfPresent(path)) === file.content) {
        return { kind: 'current', path: file.path };
    }
    if (check) {
        return { kind: 'stale', path: file.path };
    }
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, file.content);
    return { kind: 'written', path: file.path };
};

const staleFailure = (path: string): CommandFailure => ({
    subject: path,
    what: 'chart out of date',
    why: 'the file is missing or differs from what the committed results render',
    fix: 'run pnpm docs:charts and commit the chart',
});

const countOf = (outcomes: readonly ChartOutcome[], kind: ChartOutcome['kind']): number =>
    outcomes.filter((outcome) => outcome.kind === kind).length;

const runDocsCharts = async (options: DocsChartsOptions, output: CommandOutput): Promise<CommandReport> => {
    const inputs = await collectInputs();
    if (inputs.kind === 'invalid') {
        output.failure({
            subject: inputs.path,
            what: 'cannot read a result file',
            why: inputs.reason,
            fix: 'regenerate it with the command that writes it (pnpm bed --write-results, pnpm replay, pnpm repros)',
        });
        return stoppedReport(docsChartsExitCodes.resultsUnreadable, 'cannot read a result file');
    }
    const files = chartFiles(inputs.value);
    output.start({
        title: 'agent-silent-failures docs:charts',
        description: options.check
            ? `Checks ${files.length} chart files against the committed results; writes nothing.`
            : `Renders ${files.length} chart files from the committed results.`,
        measures: null,
        total: files.length,
        unit: 'charts',
        facts: [],
    });
    const outcomes = await Promise.all(files.map((file) => renderFile(file, options.check)));
    outcomes
        .filter((outcome) => outcome.kind === 'stale')
        .forEach((outcome) => output.failure(staleFailure(outcome.path)));
    const stale = countOf(outcomes, 'stale');
    const written = outcomes.filter((outcome) => outcome.kind === 'written').map((outcome) => outcome.path);
    return {
        exit: stale === 0 ? docsChartsExitCodes.upToDate : docsChartsExitCodes.stale,
        headline: `${files.length} charts: ${countOf(outcomes, 'current')} up to date, ${written.length} written, ${stale} out of date`,
        counts: { charts: files.length, upToDate: countOf(outcomes, 'current'), written: written.length, stale },
        rates: [],
        spendUsd: null,
        outputs: written,
        next: stale === 0 ? [] : [{ command: 'pnpm docs:charts', purpose: 'rewrite the out-of-date charts' }],
    };
};

process.exitCode = await runCommand(docsChartsCommand, process.argv.slice(2), runDocsCharts);
