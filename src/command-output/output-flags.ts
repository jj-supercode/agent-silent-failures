import type { OutputModeName } from './model.ts';

/** The flags every command accepts on top of its own: they decide how it talks, never what it does. */
export type OutputFlags = { readonly mode: OutputModeName | null; readonly help: boolean };

export type SplitArguments =
    | { readonly kind: 'split'; readonly flags: OutputFlags; readonly commandArgs: readonly string[] }
    | { readonly kind: 'invalid'; readonly reason: string };

const modeFlags = { '--json': 'json', '--plain': 'plain' } as const satisfies Record<string, OutputModeName>;
const helpFlags: ReadonlySet<string> = new Set(['--help', '-h']);

const isModeFlag = (arg: string): arg is keyof typeof modeFlags => Object.hasOwn(modeFlags, arg);

/**
 * Takes the output flags out of a command line, so each command parses only its own flags and an invalid command
 * line is still reported in the mode asked for. Arguments after `--` are left alone.
 */
export const splitOutputFlags = (args: readonly string[]): SplitArguments => {
    const separator = args.indexOf('--');
    const flagged = separator === -1 ? args : args.slice(0, separator);
    const rest = separator === -1 ? [] : args.slice(separator);
    const modes = [...new Set(flagged.filter(isModeFlag).map((flag) => modeFlags[flag]))];
    if (modes.length > 1) {
        return { kind: 'invalid', reason: '--json and --plain cannot be combined' };
    }
    return {
        kind: 'split',
        flags: { mode: modes[0] ?? null, help: flagged.some((arg) => helpFlags.has(arg)) },
        commandArgs: [...flagged.filter((arg) => !isModeFlag(arg) && !helpFlags.has(arg)), ...rest],
    };
};
