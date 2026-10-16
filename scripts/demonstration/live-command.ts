import { parseArgs } from 'node:util';

import {
    commonExitCodes,
    readCommandOptions,
    type CommandDefinition,
    type ExitCodeRegistry,
} from '../../src/command-output/index.ts';
import { liveExitCodeRegistry } from '../../src/live/exit-codes.ts';

export const demonstrationLiveExitCodes = {
    done: {
        code: 0,
        meaning: 'every live-capable preset was driven; a preset whose entry did not fire is reported, not a failure',
    },
    ...commonExitCodes,
    fixturesExist: liveExitCodeRegistry.fixturesExist,
    missingApiKey: liveExitCodeRegistry.missingApiKey,
    corpusUnreadable: liveExitCodeRegistry.corpusUnreadable,
} as const satisfies ExitCodeRegistry;

/**
 * `--dry-run` runs the live path with a scripted stand-in; a dry run writes a matrix only where `--out` says, and its
 * recording to a temporary directory unless `--fixtures` names one.
 */
export type DemonstrationLiveOptions = {
    readonly mode: 'live' | 'dry-run';
    readonly out: string | null;
    readonly fixtures: string | null;
};

export const demonstrationLiveOptionsFromArgs = (args: readonly string[]): DemonstrationLiveOptions => {
    const { values } = parseArgs({
        args: [...args],
        strict: true,
        options: {
            'dry-run': { type: 'boolean', default: false },
            out: { type: 'string' },
            fixtures: { type: 'string' },
        },
    });
    return {
        mode: values['dry-run'] ? 'dry-run' : 'live',
        out: values.out ?? null,
        fixtures: values.fixtures ?? null,
    };
};

export const demonstrationLiveCommand = {
    name: 'demonstration:live',
    invocation: 'pnpm demonstration:live',
    summary: 'the Studio fault matrix with every agent on Claude Haiku 5.5, behind the Studio spend cap',
    usage: 'pnpm demonstration:live [--dry-run] [--out <file>] [--fixtures <dir>] [--json | --plain]',
    options: [
        { flag: '--dry-run', description: 'the live path with a scripted stand-in for Claude: no key, no network' },
        {
            flag: '--out <file>',
            description:
                'where to write the matrix (default results/demonstration/live.json; a dry run writes only here)',
        },
        {
            flag: '--fixtures <dir>',
            description:
                'where to record the traces (default fixtures/demonstration/live/<date>/; a dry run: a temporary directory)',
        },
    ],
    exitCodes: demonstrationLiveExitCodes,
    parseOptions: (args) => readCommandOptions(() => demonstrationLiveOptionsFromArgs(args)),
} as const satisfies CommandDefinition<DemonstrationLiveOptions>;
