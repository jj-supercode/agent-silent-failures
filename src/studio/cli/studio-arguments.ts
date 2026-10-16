import type { StudioMode } from '../faults/model.ts';

/**
 * What the Studio launcher was asked to do. Its package script reads
 * `node src/studio/cli/main.ts [--live] mastra dev --dir <project>`, and pnpm appends the user's own options after it,
 * so `--fault` and `--list-faults` arrive at the end of the command they must be taken out of.
 */
export type StudioLaunch =
    | { readonly kind: 'list-faults' }
    | {
          readonly kind: 'start';
          readonly mode: StudioMode;
          /** The `--fault` value; `null` leaves the choice to the environment. */
          readonly fault: string | null;
          readonly command: readonly [string, ...string[]];
      }
    | { readonly kind: 'invalid'; readonly reason: string };

type LauncherOptions = {
    readonly fault: string | null;
    readonly listFaults: boolean;
    readonly rest: readonly string[];
    /** The previous token was `--fault`, so this one is its value. */
    readonly awaitingFault: boolean;
};

const noLauncherOptions: LauncherOptions = { fault: null, listFaults: false, rest: [], awaitingFault: false };

const faultEquals = '--fault=';

const scanToken = (scan: LauncherOptions, token: string): LauncherOptions => {
    if (scan.awaitingFault) {
        return { ...scan, fault: token, awaitingFault: false };
    }
    if (token === '--list-faults') {
        return { ...scan, listFaults: true };
    }
    if (token === '--fault') {
        return { ...scan, awaitingFault: true };
    }
    return token.startsWith(faultEquals)
        ? { ...scan, fault: token.slice(faultEquals.length) }
        : { ...scan, rest: [...scan.rest, token] };
};

const missingFault = '--fault needs a preset id (pnpm studio --list-faults shows them)';

type TakenOptions =
    | { readonly kind: 'taken'; readonly options: LauncherOptions }
    | { readonly kind: 'invalid'; readonly reason: string };

/** Takes `--fault <id>`, `--fault=<id>` and `--list-faults` out of the command; every other token stays in order. */
const takeLauncherOptions = (tokens: readonly string[]): TakenOptions => {
    const scan = tokens.reduce(scanToken, noLauncherOptions);
    return scan.awaitingFault || scan.fault === '' || scan.fault?.startsWith('--') === true
        ? { kind: 'invalid', reason: missingFault }
        : { kind: 'taken', options: scan };
};

export const parseStudioLaunch = (argv: readonly string[]): StudioLaunch => {
    const [first, ...others] = argv;
    const mode: StudioMode = first === '--live' ? 'live' : 'scripted';
    const taken = takeLauncherOptions(first === '--live' ? others : argv);
    if (taken.kind === 'invalid') {
        return taken;
    }
    const { options } = taken;
    if (options.listFaults) {
        return { kind: 'list-faults' };
    }
    const [program, ...args] = options.rest;
    return program === undefined
        ? { kind: 'invalid', reason: 'no command to start: the launcher wraps `mastra dev --dir <project>`' }
        : { kind: 'start', mode, fault: options.fault, command: [program, ...args] };
};
