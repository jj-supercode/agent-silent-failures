import { parseArgs } from 'node:util';

import { DemonstrationUsageError } from './errors.ts';
import {
    commonExitCodes,
    readCommandOptions,
    type CommandDefinition,
    type ExitCodeRegistry,
} from '../../src/command-output/index.ts';

export const demonstrationExitCodes = {
    allFired: { code: 0, meaning: "every Studio preset's entry fired on its scripted traces" },
    notAllFired: { code: 1, meaning: "a preset's entry did not fire on its scripted traces; each is reported" },
    ...commonExitCodes,
    corpusUnreadable: { code: 3, meaning: 'the committed question corpus could not be read' },
    noRecording: { code: 4, meaning: 'a recording to re-score under fixtures/demonstration/ is missing or unreadable' },
    scoringDiffers: {
        code: 5,
        meaning: "the recorded traces scored differently from Studio's trace scoring; each preset is reported",
    },
} as const satisfies ExitCodeRegistry;

/**
 * What `pnpm demonstration` does. `rehearse` (the default) records to a temporary directory and writes nothing in the
 * repository; `write` replaces today's committed scripted recording and its result file; `rescore` scores the
 * committed recordings again instead of driving the Studio agents. Both writing actions re-render the docs.
 */
export type DemonstrationAction = 'rehearse' | 'write' | 'rescore';
/** The actions that drive the Studio agents and record a new matrix. */
export type RecordingAction = Exclude<DemonstrationAction, 'rescore'>;
export type DemonstrationOptions = { readonly action: DemonstrationAction };

/** Thrown by the flag parser, which `readCommandOptions` turns into a usage error. */
const conflictingActions = '--write records a new matrix and --rescore scores the committed ones: pass one';

export const demonstrationCommand = {
    name: 'demonstration',
    invocation: 'pnpm demonstration',
    summary: 'every Studio fault preset through the scripted Studio agents, recorded as traces and scored offline',
    usage: 'pnpm demonstration [--write | --rescore] [--json | --plain]',
    options: [
        {
            flag: '--write',
            description:
                'record into fixtures/demonstration/scripted/<date>, rewrite results/demonstration/scripted.json and the docs',
        },
        {
            flag: '--rescore',
            description:
                'no agents: score the newest committed recordings again into results/demonstration/ (live too, once recorded)',
        },
    ],
    exitCodes: demonstrationExitCodes,
    parseOptions: (args) =>
        readCommandOptions(() => {
            const { values } = parseArgs({
                args: [...args],
                strict: true,
                options: { write: { type: 'boolean', default: false }, rescore: { type: 'boolean', default: false } },
            });
            if (values.write && values.rescore) {
                throw new DemonstrationUsageError(conflictingActions);
            }
            return { action: values.write ? 'write' : values.rescore ? 'rescore' : 'rehearse' };
        }),
} as const satisfies CommandDefinition<DemonstrationOptions>;
