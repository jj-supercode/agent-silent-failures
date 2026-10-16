import { appendFile, mkdtempDisposable, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { beforeAll, describe, expect, test } from 'vitest';

import { planRuns, type RunSpec } from '../../bed/index.ts';
import { loadQuestions } from '../../corpus/index.ts';
import {
    manifestAt,
    manifestBase,
    appendRecordedRun,
    fixtureFileNames,
    startFixtureSet,
    toRecordedLabels,
    writeFixtureJson,
} from '../../record/index.ts';
import { traceIdSchema } from '../../trace/index.ts';
import { emptySpend } from '../budget/model.ts';
import { selectLiveRuns } from '../live-plan.ts';
import { sessionModelIds } from '../session-models.ts';
import { keepCompletedRuns, runsBackupFileName } from './keep-completed-runs.ts';
import { prepareResume } from './prepare-resume.ts';
import { readRecordingToResume } from './recording-to-resume.ts';
import type { RecordingIdentity } from './resume-check.ts';

const plannedRuns = 4;
let planned: readonly RunSpec[] = [];
let allSpecs: readonly RunSpec[] = [];

beforeAll(async () => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        throw new Error('the corpus did not load');
    }
    allSpecs = planRuns(loaded.questions, { split: 'held-out', entryId: null });
    planned = selectLiveRuns(allSpecs, plannedRuns).runs;
});

const emptyTraceId = traceIdSchema.parse('0'.repeat(32));

type Line = { readonly spec: RunSpec | undefined; readonly kind: 'completed' | 'failed' };

/** A dry-run recording of the first planned runs, written by the recorder's own writers. */
const writeRecording = async (directory: string, lines: readonly Line[]): Promise<void> => {
    const startedAt = new Date();
    await startFixtureSet(directory, { replace: true });
    const models = sessionModelIds('dry-run', false);
    await Array.fromAsync(lines, async ({ spec, kind }) => {
        if (spec === undefined) {
            throw new Error('the plan is shorter than the test expects');
        }
        await appendRecordedRun(
            directory,
            {
                labels: toRecordedLabels(spec, spec.plan.key),
                outcome:
                    kind === 'completed'
                        ? { kind, trace: { traceId: emptyTraceId, spans: [] }, judgement: null }
                        : { kind, reason: 'HTTP 400: bad request' },
            },
            new Map(),
        );
    });
    const base = await manifestBase({ mode: 'dry-run', models, startedAt, split: 'held-out', plannedRuns });
    const progress = {
        recordedRuns: lines.length,
        failedRuns: lines.filter((line) => line.kind === 'failed').length,
        stoppedEarly: null,
    };
    await writeFixtureJson(directory, fixtureFileNames.manifest, manifestAt(base, progress, new Date()), new Map());
    await writeFixtureJson(
        directory,
        fixtureFileNames.spend,
        {
            mode: 'dry-run',
            spentUsd: 0.01,
            modelCalls: 3,
            inputTokens: emptySpend.inputTokens,
            outputTokens: emptySpend.outputTokens,
        },
        new Map(),
    );
};

const dryRunIdentity = async (directory: string): Promise<RecordingIdentity> => {
    const read = await readRecordingToResume(directory);
    if (read.kind === 'invalid') {
        throw new Error(read.reason);
    }
    return read.recording.manifest;
};

const runsFileOf = (directory: string) => path.join(directory, fixtureFileNames.runs);

describe('a recording to resume', () => {
    test('keeps completed lines byte for byte and drops failed lines and a line cut short by an interrupt', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'resume-'));
        await writeRecording(root.path, [
            { spec: planned[0], kind: 'completed' },
            { spec: planned[1], kind: 'failed' },
        ]);
        await appendFile(runsFileOf(root.path), '{"labels":{"runId":"held-out/h1');
        const read = await readRecordingToResume(root.path);
        expect(read.kind).toBe('read');
        const recording = read.kind === 'read' ? read.recording : null;
        expect(recording?.completedLines.map((line) => line.runId)).toEqual([planned[0]?.runId]);
        expect(recording?.droppedLines).toBe(2);
        const firstLine = (await readFile(runsFileOf(root.path), 'utf8')).split('\n')[0];
        expect(recording?.completedLines[0]?.text).toBe(firstLine);
    });

    test('refuses a recording with an unreadable line in the middle', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'resume-'));
        await writeRecording(root.path, [{ spec: planned[0], kind: 'completed' }]);
        await appendFile(runsFileOf(root.path), 'not json\n');
        expect((await readRecordingToResume(root.path)).kind).toBe('invalid');
    });

    test('refuses a directory without a recording', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'resume-'));
        expect((await readRecordingToResume(root.path)).kind).toBe('invalid');
    });
});

describe('prepareResume', () => {
    test('plans only the failed and missing runs and carries the earlier spend', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'resume-'));
        await writeRecording(root.path, [
            { spec: planned[0], kind: 'completed' },
            { spec: planned[1], kind: 'failed' },
        ]);
        const prepared = await prepareResume(root.path, allSpecs, await dryRunIdentity(root.path));
        expect(prepared.kind).toBe('ready');
        if (prepared.kind !== 'ready') {
            return;
        }
        expect(prepared.runs.map((spec) => spec.runId)).toEqual(planned.slice(1).map((spec) => spec.runId));
        expect(prepared.history.completedRuns).toBe(1);
        expect(prepared.history.spend.callCount).toBe(3);
        expect(prepared.history.sessions).toHaveLength(1);
    });

    test('refuses a recording made under another corpus, without touching it', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'resume-'));
        await writeRecording(root.path, [{ spec: planned[0], kind: 'failed' }]);
        const before = await readFile(runsFileOf(root.path), 'utf8');
        const identity = { ...(await dryRunIdentity(root.path)), corpusSha256: 'f'.repeat(64) };
        const prepared = await prepareResume(root.path, allSpecs, identity);
        expect(prepared.kind).toBe('refused');
        expect(await readFile(runsFileOf(root.path), 'utf8')).toBe(before);
    });

    test('reports a recording whose every run completed as complete', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'resume-'));
        await writeRecording(
            root.path,
            planned.map((spec) => ({ spec, kind: 'completed' })),
        );
        expect(await prepareResume(root.path, allSpecs, await dryRunIdentity(root.path))).toEqual({
            kind: 'complete',
            completedRuns: plannedRuns,
        });
    });
});

describe('keepCompletedRuns', () => {
    test('backs the runs file up once, then leaves only the completed lines', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'resume-'));
        await writeRecording(root.path, [
            { spec: planned[0], kind: 'failed' },
            { spec: planned[1], kind: 'completed' },
        ]);
        const original = await readFile(runsFileOf(root.path), 'utf8');
        const read = await readRecordingToResume(root.path);
        const completedLines = read.kind === 'read' ? read.recording.completedLines : [];
        await keepCompletedRuns(root.path, completedLines);
        await keepCompletedRuns(root.path, []);
        expect(await readFile(path.join(root.path, runsBackupFileName), 'utf8')).toBe(original);
        expect(await readFile(runsFileOf(root.path), 'utf8')).toBe('');
        await keepCompletedRuns(root.path, completedLines);
        expect(await readFile(runsFileOf(root.path), 'utf8')).toBe(`${original.split('\n')[1]}\n`);
        expect((await stat(path.join(root.path, runsBackupFileName))).size).toBe(original.length);
    });
});
