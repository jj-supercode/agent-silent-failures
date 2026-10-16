import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

const runFile = promisify(execFile);

/**
 * The two commands that render the docs from `results/`, run as their own processes: docs-tables already imports this
 * folder's result readers, so importing docs-tables here would make a cycle.
 */
const docsCommands = [
    fileURLToPath(new URL('../docs-tables/main.ts', import.meta.url)),
    fileURLToPath(new URL('../docs-charts/main.ts', import.meta.url)),
] as const;

export type DocsRendering = { readonly kind: 'rendered' } | { readonly kind: 'failed'; readonly reason: string };

const renderWith = async (command: string): Promise<DocsRendering> =>
    runFile(process.execPath, [command, '--plain']).then(
        (): DocsRendering => ({ kind: 'rendered' }),
        (error: unknown): DocsRendering => ({
            kind: 'failed',
            reason: error instanceof Error ? error.message : String(error),
        }),
    );

/**
 * Re-renders the README blocks and charts after a command rewrote a result file, so a committed result never sits
 * beside a stale README. Runs `pnpm docs:tables`, then `pnpm docs:charts`, and stops at the first failure.
 */
export const renderDocs = async (): Promise<DocsRendering> => {
    const [tables, charts] = docsCommands;
    const renderedTables = await renderWith(tables);
    return renderedTables.kind === 'failed' ? renderedTables : renderWith(charts);
};
