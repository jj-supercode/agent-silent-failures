import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { afterAll, beforeAll, describe, expect, test } from 'vitest';

import { CorpusLoadError, loadQuestions, type CorpusQuestion } from '../../corpus/index.ts';
import { scriptedModelId } from '../../harness/index.ts';
import { fixtureFileNames, manifestBase, sensitiveFindings, startFixtureSet } from '../../record/index.ts';
import { studioFaultPresetList } from '../faults/presets.ts';
import type { DemonstrationReport } from './model.ts';
import { readDemonstrationRecording } from './read-recording.ts';
import { plannedMatrixRuns, recordDemonstrationMatrix, type RecordedMatrix } from './record-matrix.ts';
import { scoreDemonstrationRecording } from './score-recording.ts';
import { scoringDifferences } from './scoring-differences.ts';

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}
const corpus: readonly CorpusQuestion[] = loaded.questions;
const scripted = { kind: 'scripted' } as const;

/** Re-reads the recording from disk and scores it, as `pnpm demonstration --rescore` does. */
const rescored = async (directory: string): Promise<DemonstrationReport | string> => {
    const read = await readDemonstrationRecording(directory);
    return read.kind === 'read' ? scoreDemonstrationRecording(read.recording, corpus) : read.reason;
};

describe('a scripted demonstration recorded to fixtures', () => {
    const state: { directory: string; recorded: RecordedMatrix | null } = { directory: '', recorded: null };

    beforeAll(async () => {
        state.directory = await mkdtemp(path.join(tmpdir(), 'demonstration-recording-'));
        await startFixtureSet(state.directory, { replace: true });
        state.recorded = await recordDemonstrationMatrix({
            corpus,
            model: scripted,
            recording: {
                directory: state.directory,
                environment: new Map(),
                manifestBase: await manifestBase({
                    mode: 'dry-run',
                    models: { agentModelId: scriptedModelId, judgeModelId: null },
                    startedAt: new Date(),
                    split: 'held-out',
                    plannedRuns: plannedMatrixRuns(scripted, corpus),
                }),
            },
            onPresetDone: () => undefined,
            spend: () => null,
        });
    });

    afterAll(async () => {
        await rm(state.directory, { recursive: true, force: true });
    });

    test('records every planned line, none failed, and finishes its manifest', () => {
        expect(state.recorded?.progress).toEqual({
            recordedRuns: plannedMatrixRuns(scripted, corpus),
            failedRuns: 0,
            stoppedEarly: null,
        });
    });

    test("scores from the fixtures exactly as Studio's trace scoring scored the full stored traces", async () => {
        const report = await rescored(state.directory);
        expect(typeof report).not.toBe('string');
        expect(
            typeof report === 'string' ? report : scoringDifferences(state.recorded?.studioScored ?? [], report),
        ).toEqual([]);
        expect(typeof report === 'string' ? [] : report.presets.map((presetRun) => presetRun.preset)).toEqual(
            studioFaultPresetList.map((preset) => preset.id),
        );
    });

    test('scoring the same recording twice gives the same report', async () => {
        expect(await rescored(state.directory)).toEqual(await rescored(state.directory));
    });

    test('the recorded lines hold no key, email, home path or secret environment value', async () => {
        const runs = await readFile(path.join(state.directory, fixtureFileNames.runs), 'utf8');
        expect(sensitiveFindings(runs, new Map())).toEqual([]);
    });
});
