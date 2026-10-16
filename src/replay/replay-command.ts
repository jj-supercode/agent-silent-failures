import {
    commonExitCodes,
    readCommandOptions,
    type CommandDefinition,
    type ExitCodeRegistry,
} from '../command-output/index.ts';
import { replayOptionsFromArgs, replayUsage, type ReplayOptions } from './replay-options.ts';

export const replayExitCodes = {
    allScored: { code: 0, meaning: 'every recorded run was scored' },
    unscorable: { code: 1, meaning: 'at least one recorded run could not be scored; each is reported' },
    ...commonExitCodes,
    corpusUnreadable: { code: 3, meaning: 'the committed question corpus could not be read' },
    noFixtureSet: { code: 4, meaning: 'no readable fixture set: none committed, or the one named is invalid' },
    corpusMismatch: { code: 5, meaning: 'the fixture set was recorded on another corpus; nothing was scored' },
} as const satisfies ExitCodeRegistry;

export const replayCommand = {
    name: 'replay',
    invocation: 'pnpm replay',
    summary: 'score committed real-model traces offline: the source of the recorded numbers in the README',
    usage: replayUsage,
    options: [
        { flag: '--fixtures <dir>', description: 'the fixture set to score (default: the newest committed one)' },
        { flag: '--out <dir>', description: 'where to write the reports (default: results/replay/)' },
        { flag: '--details', description: 'also print the replay notes, the headline table and every variation' },
    ],
    exitCodes: replayExitCodes,
    parseOptions: (args) => readCommandOptions(() => replayOptionsFromArgs(args)),
} as const satisfies CommandDefinition<ReplayOptions>;
