// `pnpm docs:tables` rewrites the generated blocks of the docs from the committed result files.
// `pnpm docs:tables --check` writes nothing and exits 1 when a page is out of date.
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

import { runCommand, stoppedReport, type CommandOutput, type CommandReport } from '../../src/command-output/index.ts';
import { collectInputs } from './collect-inputs.ts';
import { docsTablesCommand, docsTablesExitCodes, type DocsTablesOptions } from './docs-tables-command.ts';
import { docsTablesHeader, docsTablesReport, pageFailure, type PageOutcome } from './docs-tables-console.ts';
import { replaceGeneratedBlocks } from './generated-block.ts';
import { generatedPages, type GeneratedPage } from './pages.ts';

const repositoryRoot = new URL('../../', import.meta.url);

const formattedMarkdown = async (path: string, markdown: string): Promise<string> =>
    format(markdown, { ...(await resolveConfig(path)), filepath: path });

const renderPage = async (page: GeneratedPage, check: boolean): Promise<PageOutcome> => {
    const path = fileURLToPath(new URL(page.path, repositoryRoot));
    const current = await readFile(path, 'utf8');
    const replaced = replaceGeneratedBlocks(current, page.blocks);
    if (replaced.kind === 'missing-markers') {
        return { kind: 'missing-markers', path: page.path, name: replaced.name };
    }
    const next = await formattedMarkdown(path, replaced.markdown);
    if (next === current) {
        return { kind: 'current', path: page.path };
    }
    if (check) {
        return { kind: 'stale', path: page.path };
    }
    await writeFile(path, next);
    return { kind: 'updated', path: page.path };
};

const runDocsTables = async (options: DocsTablesOptions, output: CommandOutput): Promise<CommandReport> => {
    const inputs = await collectInputs();
    if (inputs.kind === 'invalid') {
        output.failure({
            subject: inputs.path,
            what: 'cannot read a result file',
            why: inputs.reason,
            fix: 'regenerate it with the command that writes it (pnpm bed --write-results, pnpm replay, pnpm repros)',
        });
        return stoppedReport(docsTablesExitCodes.resultsUnreadable, 'cannot read a result file');
    }
    const pages = generatedPages(inputs.value);
    output.start(docsTablesHeader(pages.length, options.check));
    const outcomes = await Promise.all(pages.map((page) => renderPage(page, options.check)));
    outcomes.flatMap((outcome) => pageFailure(outcome) ?? []).forEach(output.failure);
    return docsTablesReport(outcomes);
};

process.exitCode = await runCommand(docsTablesCommand, process.argv.slice(2), runDocsTables);
