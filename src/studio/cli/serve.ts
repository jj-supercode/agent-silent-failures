import { spawn } from 'node:child_process';
import { constants } from 'node:os';

/** A command that could not start at all, such as `mastra` off the PATH outside pnpm. */
const startFailedExitCode = 1;

/** The shell convention for a process ended by a signal: 128 plus the signal number. */
const exitCodeOf = (signal: NodeJS.Signals | null): number =>
    signal === null ? startFailedExitCode : 128 + (constants.signals[signal] ?? 0);

/**
 * Runs the command in the foreground and resolves to its exit code. The terminal signals the whole process group; a
 * signal sent to the launcher alone is forwarded, and the launcher resolves only once the command has exited.
 */
export const serve = (
    [program, ...args]: readonly [string, ...string[]],
    environment: Readonly<Record<string, string | undefined>>,
): Promise<number> => {
    const server = spawn(program, args, { stdio: 'inherit', env: environment });
    const forward = (signal: NodeJS.Signals) => server.kill(signal);
    process.on('SIGINT', forward).on('SIGTERM', forward);
    return new Promise((resolve) => {
        // A command that cannot start emits `error` and never `exit`.
        server.once('error', (error) => {
            console.error(`Refused: could not start ${program}: ${error.message}. Run it as pnpm studio.`);
            resolve(startFailedExitCode);
        });
        server.once('exit', (code, signal) => resolve(code ?? exitCodeOf(signal)));
    });
};
