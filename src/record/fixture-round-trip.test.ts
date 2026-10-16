import { appendFile, mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterEach, beforeEach, describe, expect, test } from 'vitest';

import { readFixtureSet } from './fixture-reader.ts';
import { appendRecordedRun, startFixtureSet, writeFixtureManifest } from './fixture-writer.ts';
import { fixtureFileNames, fixtureManifestSchema, fixtureSchemaVersion, type RecordedRunInput } from './model.ts';

const noEnvironment = new Map<string, string>();

const labels: RecordedRunInput['labels'] = {
    runId: 'held-out/h1/clean/baseline/q-1/r0',
    split: 'held-out',
    family: 'h1',
    questionId: 'q-1',
    replicate: 0,
    seed: 7,
    harness: 'single-agent',
    condition: { kind: 'clean', variation: 'baseline', hardNegativeFor: [] },
    observation: 'agent-run',
    modelSource: 'clean-policy',
    harnessKey: 'held-out/h1/clean/baseline',
};

const failedRun = (reason: string): RecordedRunInput => ({ labels, outcome: { kind: 'failed', reason } });

const manifest = (recordedRuns: number) =>
    fixtureManifestSchema.parse({
        schemaVersion: fixtureSchemaVersion,
        mode: 'live',
        recordedOn: '2026-10-15',
        startedAt: '2026-10-15T08:00:00.000Z',
        finishedAt: '2026-10-15T09:00:00.000Z',
        models: { agent: 'claude-haiku-5-5', judge: null },
        platform: { os: 'linux', arch: 'arm64', node: 'v24.15.0' },
        versions: {},
        corpusSha256: 'a'.repeat(64),
        split: 'held-out',
        plannedRuns: recordedRuns,
        recordedRuns,
        failedRuns: recordedRuns,
        stoppedEarly: null,
        keptSpanTypes: [],
    });

let directory = '';

beforeEach(async () => {
    directory = await mkdtemp(path.join(tmpdir(), 'fixture-files-'));
});

afterEach(async () => {
    await rm(directory, { recursive: true, force: true });
});

describe('fixture files', () => {
    test('a written set reads back whole', async () => {
        await startFixtureSet(directory, { replace: false });
        await appendRecordedRun(directory, failedRun('provider overloaded'), noEnvironment);
        await writeFixtureManifest(directory, manifest(1), noEnvironment);
        const read = await readFixtureSet(directory);
        expect(read.kind === 'read' && read.fixtures.runs.map((run) => run.outcome)).toEqual([
            { kind: 'failed', reason: 'provider overloaded' },
        ]);
    });

    test('refuses to start over a recording unless told to replace it', async () => {
        await startFixtureSet(directory, { replace: false });
        await appendRecordedRun(directory, failedRun('kept'), noEnvironment);
        expect(await startFixtureSet(directory, { replace: false })).toEqual({ kind: 'exists', directory });
        expect(await readFile(path.join(directory, fixtureFileNames.runs), 'utf8')).toContain('kept');
        expect(await startFixtureSet(directory, { replace: true })).toEqual({ kind: 'started' });
    });

    test('lets a session start again over an attempt that recorded no run', async () => {
        await startFixtureSet(directory, { replace: false });
        expect(await startFixtureSet(directory, { replace: false })).toEqual({ kind: 'started' });
    });

    test('withholds a run whose line looks sensitive, keeping the run counted without its content', async () => {
        await startFixtureSet(directory, { replace: false });
        const appended = await appendRecordedRun(
            directory,
            failedRun('request to /Users/someone/project failed'),
            noEnvironment,
        );
        const text = await readFile(path.join(directory, fixtureFileNames.runs), 'utf8');
        expect(appended.kind).toBe('withheld');
        expect(text).not.toContain('someone');
        expect(text).toContain('withheld from the fixture: it matched home-path');
    });

    test('reports a line cut short by an interrupted write instead of throwing', async () => {
        await startFixtureSet(directory, { replace: false });
        await appendRecordedRun(directory, failedRun('complete'), noEnvironment);
        await appendFile(path.join(directory, fixtureFileNames.runs), '{"labels":{"runId":');
        await writeFixtureManifest(directory, manifest(2), noEnvironment);
        const read = await readFixtureSet(directory);
        expect(read.kind === 'invalid' && read.reason).toMatch(/runs\.jsonl line 2/);
    });

    test('reports the physical line number of a bad line that follows a blank line', async () => {
        await startFixtureSet(directory, { replace: false });
        await appendRecordedRun(directory, failedRun('complete'), noEnvironment);
        await appendFile(path.join(directory, fixtureFileNames.runs), '\n{"labels":{"runId":\n');
        await writeFixtureManifest(directory, manifest(2), noEnvironment);
        const read = await readFixtureSet(directory);
        expect(read.kind === 'invalid' && read.reason).toMatch(/runs\.jsonl line 3:/);
    });

    test('reports a missing manifest instead of throwing', async () => {
        await startFixtureSet(directory, { replace: false });
        expect((await readFixtureSet(directory)).kind).toBe('invalid');
    });

    test('refuses a manifest whose run count does not match the runs file', async () => {
        await startFixtureSet(directory, { replace: false });
        await writeFixtureManifest(directory, manifest(3), noEnvironment);
        const read = await readFixtureSet(directory);
        expect(read.kind === 'invalid' && read.reason).toMatch(/records 3 runs/);
    });
});
