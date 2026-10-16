import type { CommandDefinition } from '../command-output/index.ts';
import { liveExitCodeRegistry } from './exit-codes.ts';
import { liveUsage, parseLiveOptions, type LiveOptions } from './live-options.ts';

export const liveCommand = {
    name: 'demo:live',
    invocation: 'pnpm demo:live',
    summary: 'record real-model traces with Claude behind a hard budget guard (--dry-run: scripted, free, offline)',
    usage: liveUsage,
    options: [
        {
            flag: '--dry-run',
            description: 'the whole pipeline with the scripted policies: no key, no network, no cost',
        },
        { flag: '--max-usd <usd>', description: 'hard cap on the recording; the pre-flight refuses above it' },
        { flag: '--judge', description: 'add an answer judge (raises the worst case)' },
        { flag: '--max-runs <n>', description: 'a short session, round-robin over conditions' },
        {
            flag: '--out <dir>',
            description:
                'write the recording here (default: fixtures/live/<date>; a dry run uses a temporary directory)',
        },
        {
            flag: '--resume <dir>',
            description: 're-run the failed and missing runs; completed runs are never sent again',
        },
    ],
    exitCodes: liveExitCodeRegistry,
    parseOptions: parseLiveOptions,
} as const satisfies CommandDefinition<LiveOptions>;
