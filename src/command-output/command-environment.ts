// Where a command writes and what it reads about its surroundings; tests pass their own.

export type TextSink = { readonly write: (text: string) => unknown };

export type CommandEnvironment = {
    readonly stdout: TextSink;
    readonly stderr: TextSink;
    readonly variables: Readonly<Record<string, string | undefined>>;
    readonly stdoutIsTerminal: boolean;
    readonly stderrIsTerminal: boolean;
    /** Milliseconds on a monotonic clock. */
    readonly now: () => number;
    readonly peakRssBytes: () => number;
};

const bytesPerKibibyte = 1024;

/** A closed pipe, and every write after it. */
const closedReaderCodes: ReadonlySet<unknown> = new Set(['EPIPE', 'ERR_STREAM_DESTROYED']);

/**
 * A reader that goes away (`pnpm bed --json | head -1`) is not a failure of the command: the rest of its output is
 * dropped, and the command still finishes its work (results are written and harnesses disposed). Any other stream
 * error stays fatal.
 */
const toleratingClosedReader = (stream: NodeJS.WriteStream): TextSink => {
    stream.on('error', (error: NodeJS.ErrnoException) => {
        if (!closedReaderCodes.has(error.code)) {
            throw error;
        }
    });
    return stream;
};

export const processEnvironment = (): CommandEnvironment => ({
    stdout: toleratingClosedReader(process.stdout),
    stderr: toleratingClosedReader(process.stderr),
    variables: process.env,
    stdoutIsTerminal: process.stdout.isTTY,
    stderrIsTerminal: process.stderr.isTTY,
    now: () => performance.now(),
    // Node reports maxRSS in kibibytes on every platform.
    peakRssBytes: () => process.resourceUsage().maxRSS * bytesPerKibibyte,
});
