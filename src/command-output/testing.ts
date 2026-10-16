import { unitIntervalSchema } from '../trace/model.ts';
import type { CommandEnvironment } from './command-environment.ts';
import { commonExitCodes } from './exit-codes.ts';
import type { CommandReport, ExitCodeRegistry } from './model.ts';
import type { CommandDefinition } from './run-command.ts';

export const samplePeakRssBytes = 512 * 1024 * 1024;

export type CapturedEnvironment = CommandEnvironment & {
    readonly stdoutText: () => string;
    readonly stderrText: () => string;
    /** Moves the fake clock on; it stands still otherwise, so durations depend on the work, not on clock reads. */
    readonly advanceClock: (milliseconds: number) => void;
};

/** A deterministic environment that records what a command writes. */
export const capturedEnvironment = (
    overrides: Partial<Pick<CommandEnvironment, 'variables' | 'stdoutIsTerminal' | 'stderrIsTerminal'>> = {},
): CapturedEnvironment => {
    const stdout: string[] = [];
    const stderr: string[] = [];
    let clock = 0;
    return {
        stdout: { write: (text: string) => stdout.push(text) },
        stderr: { write: (text: string) => stderr.push(text) },
        variables: overrides.variables ?? {},
        stdoutIsTerminal: overrides.stdoutIsTerminal ?? false,
        stderrIsTerminal: overrides.stderrIsTerminal ?? false,
        now: () => clock,
        peakRssBytes: () => samplePeakRssBytes,
        stdoutText: () => stdout.join(''),
        stderrText: () => stderr.join(''),
        advanceClock: (milliseconds) => {
            clock += milliseconds;
        },
    };
};

export const sampleExitCodes = {
    done: { code: 0, meaning: 'every sample unit finished' },
    unitsFailed: { code: 1, meaning: 'a sample unit failed' },
    ...commonExitCodes,
} as const satisfies ExitCodeRegistry;

export type SampleOptions = { readonly units: number };

/** `sample [--units <n>]`: reads one flag and refuses anything else. */
export const sampleCommand = {
    name: 'sample',
    invocation: 'pnpm sample',
    summary: 'a command used to test the output module',
    usage: 'pnpm sample [--units <n>] [--json | --plain]',
    options: [{ flag: '--units <n>', description: 'how many units to run' }],
    exitCodes: sampleExitCodes,
    parseOptions: (args) => {
        const [flag, value, ...rest] = args;
        if (args.length === 0) {
            return { kind: 'parsed', options: { units: 3 } };
        }
        return flag === '--units' && value !== undefined && rest.length === 0 && Number.isInteger(Number(value))
            ? { kind: 'parsed', options: { units: Number(value) } }
            : { kind: 'invalid', reason: `unknown arguments: ${args.join(' ')}` };
    },
} as const satisfies CommandDefinition<SampleOptions>;

const sampleCaught = 2;
const sampleTrials = 3;

export const sampleReport = (failed: number): CommandReport => ({
    exit: failed === 0 ? sampleExitCodes.done : sampleExitCodes.unitsFailed,
    headline: `3 units finished, ${failed} failed`,
    counts: { units: 3, failed },
    rates: [
        {
            group: 'held-out',
            subject: 'flat-score',
            measure: 'caught',
            events: sampleCaught,
            trials: sampleTrials,
            share: unitIntervalSchema.parse(sampleCaught / sampleTrials),
            interval: { lower: unitIntervalSchema.parse(0.2), upper: unitIntervalSchema.parse(0.94) },
        },
    ],
    spendUsd: null,
    outputs: ['results/sample.json'],
    next: [{ command: 'pnpm next', purpose: 'what to run next' }],
});
