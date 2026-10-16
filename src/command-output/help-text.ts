import type { ExitCodeRegistry, OptionHelp } from './model.ts';
import { outputModeVariable } from './output-mode.ts';

/** What `--help` says about one command. */
export type CommandHelp = {
    readonly invocation: string;
    readonly summary: string;
    readonly usage: string;
    readonly options: readonly OptionHelp[];
    readonly exitCodes: ExitCodeRegistry;
};

export const outputOptions: readonly OptionHelp[] = [
    { flag: '--json', description: 'newline-delimited JSON events on stdout (schema in the README)' },
    { flag: '--plain', description: 'no colour, no rewritten lines, stable line prefixes' },
    { flag: '--help, -h', description: 'this help' },
];

const optionRows = (options: readonly OptionHelp[]): readonly string[] => {
    const flagWidth = Math.max(...options.map((option) => option.flag.length));
    return options.map((option) => `  ${option.flag.padEnd(flagWidth)}  ${option.description}`);
};

const exitCodeRows = (registry: ExitCodeRegistry): readonly string[] =>
    Object.values(registry)
        .toSorted((left, right) => left.code - right.code)
        .map((exit) => `  ${String(exit.code).padStart(3)}  ${exit.meaning}`);

export const helpText = (help: CommandHelp): string =>
    [
        `${help.invocation}: ${help.summary}`,
        '',
        `usage: ${help.usage}`,
        '',
        'options:',
        ...optionRows([...help.options, ...outputOptions]),
        '',
        'output: a terminal gets colour and one progress line; a pipe, a file or CI gets plain lines.',
        `  ${outputModeVariable}=human|plain|json sets the mode; --json and --plain override it.`,
        '',
        'exit codes:',
        ...exitCodeRows(help.exitCodes),
        '',
    ].join('\n');
