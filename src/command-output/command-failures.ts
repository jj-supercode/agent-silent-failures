import type { CommandHelp } from './help-text.ts';
import type { CommandFailure } from './model.ts';

/** A command line or setting the command cannot read: the fix is its usage. */
export const invalidArgumentsFailure = (help: CommandHelp, reason: string): CommandFailure => ({
    subject: null,
    what: 'invalid arguments',
    why: reason,
    fix: `usage: ${help.usage} (${help.invocation} --help explains each flag)`,
});

const errorDescription = (error: unknown): string =>
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);

/** A bug, not a user error: the failure names the error; its stack is written apart, for the issue report. */
export const unexpectedErrorFailure = (help: CommandHelp, error: unknown): CommandFailure => ({
    subject: null,
    what: `${help.invocation} stopped on an unexpected error`,
    why: errorDescription(error),
    fix: 'this is a bug: please open an issue with this output',
});

/** The stack of an unexpected error, for stderr only. */
export const errorStack = (error: unknown): string =>
    error instanceof Error ? (error.stack ?? error.message) : String(error);
