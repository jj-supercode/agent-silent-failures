import type { CommandEnvironment } from './command-environment.ts';
import type { OutputMode } from './model.ts';
import { splitOutputFlags } from './output-flags.ts';
import { resolveOutputMode } from './output-mode.ts';

/** What a command line asks for before the command reads its own flags. */
export type Invocation =
    | {
          readonly kind: 'readable';
          readonly mode: OutputMode;
          readonly help: boolean;
          readonly commandArgs: readonly string[];
      }
    | { readonly kind: 'unreadable'; readonly mode: OutputMode; readonly reason: string };

/** An output flag or variable that cannot be read is reported in plain mode, the one every reader can parse. */
export const readInvocation = (
    argv: readonly string[],
    environment: Pick<CommandEnvironment, 'variables' | 'stdoutIsTerminal' | 'stderrIsTerminal'>,
): Invocation => {
    const split = splitOutputFlags(argv);
    if (split.kind === 'invalid') {
        return { kind: 'unreadable', mode: { kind: 'plain' }, reason: split.reason };
    }
    const resolution = resolveOutputMode({
        flag: split.flags.mode,
        environment: environment.variables,
        stdoutIsTerminal: environment.stdoutIsTerminal,
        stderrIsTerminal: environment.stderrIsTerminal,
    });
    return resolution.kind === 'invalid'
        ? { kind: 'unreadable', mode: { kind: 'plain' }, reason: resolution.reason }
        : { kind: 'readable', mode: resolution.mode, help: split.flags.help, commandArgs: split.commandArgs };
};
