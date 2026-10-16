import {
    commonExitCodes,
    type CommandDefinition,
    type CommandOptions,
    type ExitCodeRegistry,
} from '../../src/command-output/index.ts';

export type ReprosOptions = { readonly reproductionIds: readonly string[] };

export const reprosExitCodes = {
    allReproduce: { code: 0, meaning: 'every selected behaviour still reproduces' },
    changed: { code: 1, meaning: 'a behaviour no longer reproduces (changed upstream?) or a repro broke' },
    ...commonExitCodes,
} as const satisfies ExitCodeRegistry;

/** Positional ids, each one a repro folder; none selects every repro. */
export const reprosOptionsFromArgs =
    (knownIds: readonly string[]) =>
    (args: readonly string[]): CommandOptions<ReprosOptions> => {
        const unknown = args.filter((arg) => !knownIds.includes(arg));
        return unknown.length === 0
            ? { kind: 'parsed', options: { reproductionIds: args.length === 0 ? knownIds : args } }
            : {
                  kind: 'invalid',
                  reason: `unknown repro or flag: ${unknown.join(', ')}; known repros: ${knownIds.join(', ')}`,
              };
    };

export const reprosCommand = (knownIds: readonly string[]) =>
    ({
        name: 'repros',
        invocation: 'pnpm repros',
        summary: 'check that each recorded Mastra behaviour still reproduces on the pinned versions, offline',
        usage: 'pnpm repros [<id> ...] [--json | --plain]',
        options: [{ flag: '<id> ...', description: 'run only these repros (default: every repro)' }],
        exitCodes: reprosExitCodes,
        parseOptions: reprosOptionsFromArgs(knownIds),
    }) as const satisfies CommandDefinition<ReprosOptions>;
