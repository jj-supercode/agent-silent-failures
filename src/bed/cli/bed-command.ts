import { readCommandOptions, type CommandDefinition } from '../../command-output/index.ts';
import { bedExitCodes } from './bed-exit-codes.ts';
import { bedOptionsFromArgs, bedUsage, type BedOptions } from './bed-options.ts';

export const bedCommand = {
    name: 'bed',
    invocation: 'pnpm bed',
    summary: 'measure every detector: catch rate on faulted runs, false-alarm rate on clean runs, offline',
    usage: bedUsage,
    options: [
        { flag: '--split dev|held-out|all', description: 'which split to run (default all)' },
        { flag: '--entry <id>', description: 'report one catalog entry' },
        { flag: '--write-results', description: 'rewrite results/offline/ (needs --split all and no --entry)' },
        { flag: '--report-json <path>', description: 'also write the full JSON report to <path>' },
        { flag: '--details', description: 'also print the headline table and the rate of every variation' },
        { flag: '--embedding-batch-size <n>', description: 'smaller batches lower peak memory; vectors are unchanged' },
        { flag: '--cold', description: 'switch the embedding cache off (the slowest, worst-case run)' },
    ],
    exitCodes: bedExitCodes,
    parseOptions: (args) => readCommandOptions(() => bedOptionsFromArgs(args)),
} as const satisfies CommandDefinition<BedOptions>;
