import type { ExitCodeRegistry } from './model.ts';

/** The codes every command shares: the same meaning whichever command returns them. */
export const commonExitCodes = {
    invalidArguments: { code: 2, meaning: 'the arguments or settings could not be read; nothing was run' },
    unexpectedError: { code: 70, meaning: 'an unexpected error (a bug); the failure names it' },
} as const satisfies Pick<ExitCodeRegistry, 'invalidArguments' | 'unexpectedError'>;
