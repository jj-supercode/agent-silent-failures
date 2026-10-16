import { parseArgs } from 'node:util';

import {
    commonExitCodes,
    readCommandOptions,
    type CommandDefinition,
    type ExitCodeRegistry,
} from '../../src/command-output/index.ts';

export type DocsChartsOptions = {
    /** Write nothing; fail when a chart file is out of date. */
    readonly check: boolean;
};

export const docsChartsExitCodes = {
    upToDate: { code: 0, meaning: 'every chart is up to date or was just written' },
    stale: { code: 1, meaning: '--check found a chart out of date or missing; nothing was written' },
    ...commonExitCodes,
    resultsUnreadable: { code: 3, meaning: 'a committed result file is missing or does not match its schema' },
} as const satisfies ExitCodeRegistry;

export const docsChartsOptionsFromArgs = (args: readonly string[]): DocsChartsOptions => ({
    check: parseArgs({ args: [...args], strict: true, options: { check: { type: 'boolean', default: false } } }).values
        .check,
});

export const docsChartsCommand = {
    name: 'docs:charts',
    invocation: 'pnpm docs:charts',
    summary: 'render the README charts (SVG, light and dark) from the committed result files',
    usage: 'pnpm docs:charts [--check] [--json | --plain]',
    options: [{ flag: '--check', description: 'write nothing; exit 1 when a chart is out of date (CI runs this)' }],
    exitCodes: docsChartsExitCodes,
    parseOptions: (args) => readCommandOptions(() => docsChartsOptionsFromArgs(args)),
} as const satisfies CommandDefinition<DocsChartsOptions>;
