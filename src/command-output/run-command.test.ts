import { stripVTControlCharacters } from 'node:util';

import { describe, expect, test } from 'vitest';

import type { CommandOutput } from './command-output.ts';
import { commandEventSchema, type CommandReport } from './model.ts';
import { outputModeVariable } from './output-mode.ts';
import { runCommand } from './run-command.ts';
import {
    capturedEnvironment,
    sampleCommand,
    sampleReport,
    type CapturedEnvironment,
    type SampleOptions,
} from './testing.ts';

const failedUnit = 2;
const millisecondsPerUnit = 250;

/** Three units of 250 ms each, the second fails; then a section, a warning and the report. */
const sampleRunOn =
    (environment: CapturedEnvironment) =>
    (options: SampleOptions, output: CommandOutput): Promise<CommandReport> => {
        output.start({
            title: 'agent-silent-failures sample',
            description: `Runs ${options.units} units.`,
            measures: 'how many units finish',
            total: options.units,
            unit: 'units',
            facts: [['stack', 'offline']],
        });
        {
            using tracker = output.trackProgress(options.units, 'units');
            Array.from({ length: options.units }, (_, index) => index + 1).forEach((unit) => {
                environment.advanceClock(millisecondsPerUnit);
                tracker.update(
                    unit === failedUnit
                        ? {
                              kind: 'failed',
                              failure: { subject: `unit-${unit}`, what: 'unit failed', why: 'it timed out', fix: null },
                              spendUsd: null,
                          }
                        : { kind: 'done', spendUsd: null },
                );
            });
        }
        output.section('Results', ['flat-score  2/3']);
        output.warning('one unit was slow', ['unit-3: 2 s']);
        return Promise.resolve(sampleReport(1));
    };

describe('runCommand, plain mode (a pipe, CI, a coding agent)', () => {
    test('prints stable prefixed lines, progress at checkpoints, each failure, and a summary with the exit meaning', async () => {
        const environment = capturedEnvironment();
        const exitCode = await runCommand(sampleCommand, [], sampleRunOn(environment), environment);
        expect(exitCode).toBe(1);
        expect(environment.stdoutText().split('\n')).toEqual([
            'start: agent-silent-failures sample: Runs 3 units.',
            'measures: how many units finish',
            'stack: offline',
            'progress: 33% 1/3 units, 0 failed, 0.3 s elapsed, ETA 0.5 s',
            'failure: unit failed (unit-2): it timed out',
            'progress: 66% 2/3 units, 1 failed, 0.5 s elapsed, ETA 0.3 s',
            'progress: 100% 3/3 units, 1 failed, 0.8 s elapsed',
            'section: Results',
            '  flat-score  2/3',
            'warning: one unit was slow: unit-3: 2 s',
            'summary: 3 units finished, 1 failed',
            'time: 0.8 s, peak RSS 512 MiB',
            'wrote: results/sample.json',
            'next: pnpm next (what to run next)',
            'exit: 1 (a sample unit failed)',
            '',
        ]);
        expect(environment.stderrText()).toBe('');
    });
});

describe('runCommand, json mode', () => {
    test('prints only schema-valid events, one per line, ending with a summary that carries exact values', async () => {
        const environment = capturedEnvironment();
        await runCommand(sampleCommand, ['--json'], sampleRunOn(environment), environment);
        const events = environment
            .stdoutText()
            .trimEnd()
            .split('\n')
            .map((line) => commandEventSchema.parse(JSON.parse(line)));
        expect(events.map((event) => event.event)).toEqual([
            'start',
            'progress',
            'failure',
            'progress',
            'progress',
            'warning',
            'summary',
        ]);
        expect(events.at(-1)).toMatchObject({
            event: 'summary',
            schemaVersion: 1,
            command: 'sample',
            ok: false,
            exitCode: 1,
            exitMeaning: 'a sample unit failed',
            counts: { units: 3, failed: 1 },
            rates: [{ subject: 'flat-score', share: 2 / 3 }],
            outputs: ['results/sample.json'],
        });
    });

    test('a library logging to stdout during a json run is moved to stderr', async () => {
        const environment = capturedEnvironment();
        const noisyRun = async (options: SampleOptions, output: CommandOutput): Promise<CommandReport> => {
            console.log('library chatter');
            return sampleRunOn(environment)(options, output);
        };
        const original = console.log;
        console.log = (...values: readonly unknown[]) => environment.stdout.write(`${values.join(' ')}\n`);
        try {
            await runCommand(sampleCommand, ['--json'], noisyRun, environment);
        } finally {
            console.log = original;
        }
        expect(environment.stdoutText()).not.toContain('library chatter');
    });
});

describe('runCommand, human mode (a terminal)', () => {
    test('styles the header and summary and rewrites one progress line on stderr', async () => {
        const environment = capturedEnvironment({ stdoutIsTerminal: true, stderrIsTerminal: true });
        await runCommand(sampleCommand, [], sampleRunOn(environment), environment);
        const stdout = environment.stdoutText();
        expect(stdout).not.toBe(stripVTControlCharacters(stdout));
        expect(stripVTControlCharacters(stdout).split('\n')).toEqual([
            'agent-silent-failures sample',
            '  Runs 3 units.',
            '  Measures   how many units finish',
            '  Stack      offline',
            '',
            'Results',
            '  flat-score  2/3',
            '',
            '✖ 3 units finished, 1 failed',
            '  Time       0.8 s · peak RSS 512 MiB',
            '  Wrote      results/sample.json',
            '  Next       pnpm next  what to run next',
            '  Exit       1 a sample unit failed',
            '',
        ]);
        expect(environment.stderrText()).toContain('\r\u001b[2K');
        const stderr = stripVTControlCharacters(environment.stderrText());
        expect(stderr).toContain('3/3 units · 1 failed');
        expect(stderr).toContain('✖ unit failed unit-2\n  it timed out\n');
        expect(stderr).toContain('▲ one unit was slow\n  unit-3: 2 s\n');
    });

    test('NO_COLOR prints the same layout with no escape codes on stdout', async () => {
        const environment = capturedEnvironment({
            stdoutIsTerminal: true,
            stderrIsTerminal: true,
            variables: { NO_COLOR: '1' },
        });
        await runCommand(sampleCommand, [], sampleRunOn(environment), environment);
        expect(environment.stdoutText()).toBe(stripVTControlCharacters(environment.stdoutText()));
        expect(environment.stdoutText()).toContain('✖ 3 units finished, 1 failed');
    });
});

describe('runCommand, every mode', () => {
    test('--help prints usage, the output options and every exit code, and runs nothing', async () => {
        const environment = capturedEnvironment();
        const exitCode = await runCommand(sampleCommand, ['--help'], sampleRunOn(environment), environment);
        expect(exitCode).toBe(0);
        const help = environment.stdoutText();
        expect(help).toContain('usage: pnpm sample [--units <n>] [--json | --plain]');
        expect(help).toContain('--units <n>');
        expect(help).toContain('--json');
        expect(help).toContain(outputModeVariable);
        expect(help).toContain('  70  an unexpected error');
        expect(help).not.toContain('start:');
    });

    test('invalid arguments are a failure with the usage as the fix, exit 2, and nothing runs', async () => {
        const environment = capturedEnvironment();
        const exitCode = await runCommand(sampleCommand, ['--bogus'], sampleRunOn(environment), environment);
        expect(exitCode).toBe(2);
        expect(environment.stdoutText()).toContain(
            'failure: invalid arguments: unknown arguments: --bogus; fix: usage: pnpm sample',
        );
        expect(environment.stdoutText()).not.toContain('start:');
    });

    test('an unreadable mode variable is reported in plain mode', async () => {
        const environment = capturedEnvironment({ variables: { [outputModeVariable]: 'yaml' } });
        expect(await runCommand(sampleCommand, [], sampleRunOn(environment), environment)).toBe(2);
        expect(environment.stdoutText()).toContain(`failure: invalid arguments: ${outputModeVariable} must be one of`);
    });

    test('an unexpected error is named in a failure, its stack goes to stderr, and the exit code is 70', async () => {
        const environment = capturedEnvironment({ variables: { [outputModeVariable]: 'json' } });
        const exitCode = await runCommand(
            sampleCommand,
            [],
            () => Promise.reject(new RangeError('index out of range')),
            environment,
        );
        expect(exitCode).toBe(70);
        const events = environment
            .stdoutText()
            .trimEnd()
            .split('\n')
            .map((line) => commandEventSchema.parse(JSON.parse(line)));
        expect(events.map((event) => event.event)).toEqual(['failure', 'summary']);
        expect(events[0]).toMatchObject({ why: 'RangeError: index out of range' });
        expect(environment.stderrText()).toContain('RangeError: index out of range\n    at ');
    });
});
