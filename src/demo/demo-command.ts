import { parseArgs } from 'node:util';

import { bedExitCodes, embeddingArgOptions, embeddingSettingsFromArgs } from '../bed/index.ts';
import { readCommandOptions, type CommandDefinition } from '../command-output/index.ts';
import type { HarnessSettings } from '../harness/index.ts';

export type DemoOptions = {
    /** Laid over every planned harness. */
    readonly settings: Partial<HarnessSettings>;
    /** Also print the headline table and every per-variation rate. */
    readonly details: boolean;
};

/** Reads `pnpm demo` arguments; throws on an unknown flag or value. */
export const demoOptionsFromArgs = (args: readonly string[]): DemoOptions => {
    const { values } = parseArgs({
        args: [...args],
        strict: true,
        options: { ...embeddingArgOptions, details: { type: 'boolean', default: false } },
    });
    return {
        settings: embeddingSettingsFromArgs({
            'embedding-batch-size': values['embedding-batch-size'],
            cold: values.cold,
        }),
        details: values.details,
    };
};

export const demoCommand = {
    name: 'demo',
    invocation: 'pnpm demo',
    summary: 'every fault and clean variation on three held-out questions, offline, in seconds',
    usage: 'pnpm demo [--details] [--embedding-batch-size <n>] [--cold] [--json | --plain]',
    options: [
        { flag: '--details', description: 'also print the headline table and the rate of every variation' },
        { flag: '--embedding-batch-size <n>', description: 'smaller batches lower peak memory; vectors are unchanged' },
        { flag: '--cold', description: 'switch the embedding cache off (the slowest, worst-case run)' },
    ],
    exitCodes: bedExitCodes,
    parseOptions: (args) => readCommandOptions(() => demoOptionsFromArgs(args)),
} as const satisfies CommandDefinition<DemoOptions>;
