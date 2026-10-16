import { parseArgs } from 'node:util';

import {
    commonExitCodes,
    readCommandOptions,
    type CommandDefinition,
    type ExitCodeRegistry,
} from '../../src/command-output/index.ts';

export type DocsTablesOptions = {
    /** Write nothing; fail when a page is out of date. */
    readonly check: boolean;
};

export const docsTablesExitCodes = {
    upToDate: { code: 0, meaning: 'every page is up to date or was just updated' },
    stale: { code: 1, meaning: '--check found a page out of date or missing its block markers; nothing was written' },
    ...commonExitCodes,
    resultsUnreadable: { code: 3, meaning: 'a committed result file is missing or does not match its schema' },
} as const satisfies ExitCodeRegistry;

export const docsTablesOptionsFromArgs = (args: readonly string[]): DocsTablesOptions => ({
    check: parseArgs({ args: [...args], strict: true, options: { check: { type: 'boolean', default: false } } }).values
        .check,
});

export const docsTablesCommand = {
    name: 'docs:tables',
    invocation: 'pnpm docs:tables',
    summary: 'rewrite the generated blocks of the README and docs from the committed result files',
    usage: 'pnpm docs:tables [--check] [--json | --plain]',
    options: [{ flag: '--check', description: 'write nothing; exit 1 when a page is out of date (CI runs this)' }],
    exitCodes: docsTablesExitCodes,
    parseOptions: (args) => readCommandOptions(() => docsTablesOptionsFromArgs(args)),
} as const satisfies CommandDefinition<DocsTablesOptions>;
