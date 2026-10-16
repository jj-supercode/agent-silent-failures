import { execFile, spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdir, mkdtemp, readFile, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { afterAll, describe, expect, test } from 'vitest';

import { commandEventSchema } from '../command-output/index.ts';

const run = promisify(execFile);
const repositoryRoot = path.resolve(import.meta.dirname, '../..');
// Inside the repository (and git-ignored), so the written files are formatted with the project's Prettier config.
const scratchRoot = path.join(repositoryRoot, '.cache');
const committedReplay = path.join(repositoryRoot, 'results', 'replay');
const replayFiles = ['report.md', 'report.json', 'replay.json'] as const;

const outputModes = [
    { name: 'human', variables: { AGENT_SILENT_FAILURES_OUTPUT: 'human' }, args: [] },
    { name: 'plain', variables: {}, args: ['--plain'] },
    { name: 'json', variables: {}, args: ['--json'] },
] as const;

const scratchDirectories: string[] = [];

const scratchDirectory = async (): Promise<string> => {
    await mkdir(scratchRoot, { recursive: true });
    const directory = await mkdtemp(path.join(scratchRoot, 'replay-output-'));
    scratchDirectories.push(directory);
    return directory;
};

const runScript = (script: string, args: readonly string[], variables: Readonly<Record<string, string>>) =>
    run(process.execPath, [script, ...args], {
        cwd: repositoryRoot,
        env: { ...process.env, ...variables, ANTHROPIC_API_KEY: '', CI: '' },
    });

afterAll(async () => {
    await Promise.all(scratchDirectories.map((directory) => rm(directory, { recursive: true, force: true })));
});

describe('output modes change the console only, never a result file', () => {
    test.each(outputModes)(
        'pnpm replay in $name mode writes reports byte-identical to the committed ones',
        async (mode) => {
            const out = await scratchDirectory();
            const { stdout } = await runScript('src/replay/main.ts', ['--out', out, ...mode.args], mode.variables);
            await Promise.all(
                replayFiles.map(async (file) =>
                    expect(await readFile(path.join(out, file), 'utf8')).toBe(
                        await readFile(path.join(committedReplay, file), 'utf8'),
                    ),
                ),
            );
            if (mode.name === 'json') {
                const events = stdout
                    .trimEnd()
                    .split('\n')
                    .map((line) => commandEventSchema.parse(JSON.parse(line)));
                expect(events.at(-1)).toMatchObject({ event: 'summary', exitCode: 0, ok: true });
            }
        },
    );

    test.each(outputModes)(
        'pnpm docs:tables --check in $name mode finds every generated block current',
        async (mode) => {
            const { stdout } = await runScript(
                'scripts/docs-tables/main.ts',
                ['--check', ...mode.args],
                mode.variables,
            );
            expect(stdout).toMatch(/0 out of date/);
        },
    );

    test('a reader that closes the pipe early (| head -1) neither crashes the command nor stops its reports', async () => {
        const out = await scratchDirectory();
        const child = spawn(process.execPath, ['src/replay/main.ts', '--out', out, '--json'], {
            cwd: repositoryRoot,
            env: { ...process.env, ANTHROPIC_API_KEY: '' },
        });
        const exited = new Promise<number | null>((resolve) => child.on('exit', resolve));
        const stderr: Buffer[] = [];
        child.stderr.on('data', (chunk: Buffer) => stderr.push(chunk));
        await once(child.stdout, 'data');
        child.stdout.destroy();
        const exitCode = await exited;
        expect(exitCode).toBe(0);
        expect(Buffer.concat(stderr).toString('utf8')).not.toContain('EPIPE');
        expect(await readFile(path.join(out, 'report.json'), 'utf8')).toBe(
            await readFile(path.join(committedReplay, 'report.json'), 'utf8'),
        );
    });
});
