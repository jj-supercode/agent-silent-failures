import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { z } from 'zod';

import { displayPath } from '../../command-output/index.ts';
import { corpusSha256, fixtureFileNames, parsedJson, readFixtureSet } from '../../record/index.ts';
import { demonstrationSpendSchema, type DemonstrationSpend } from './model.ts';
import { presetOfHarnessKey } from './recording-labels.ts';
import type { DemonstrationRecording } from './score-recording.ts';

const repositoryRoot = fileURLToPath(new URL('../../../', import.meta.url));

export type RecordingRead =
    | { readonly kind: 'read'; readonly recording: DemonstrationRecording }
    | { readonly kind: 'invalid'; readonly directory: string; readonly reason: string };

type SpendRead =
    | { readonly kind: 'read'; readonly spend: DemonstrationSpend | null }
    | { readonly kind: 'invalid'; readonly reason: string };

/** `spend.json` if the recording has one (a scripted recording does not), validated. */
const readSpend = async (directory: string): Promise<SpendRead> => {
    const text = await readFile(path.join(directory, fixtureFileNames.spend), 'utf8').catch(() => null);
    if (text === null) {
        return { kind: 'read', spend: null };
    }
    const parsed = parsedJson(text);
    if ('problem' in parsed) {
        return { kind: 'invalid', reason: `${fixtureFileNames.spend}: ${parsed.problem}` };
    }
    const spend = demonstrationSpendSchema.safeParse(parsed.json);
    return spend.success
        ? { kind: 'read', spend: spend.data }
        : { kind: 'invalid', reason: `${fixtureFileNames.spend}: ${z.prettifyError(spend.error)}` };
};

/**
 * Reads a demonstration recording for offline scoring. Refuses, as values, a set that is not a whole fixture set, a
 * line no demonstration wrote, and a set recorded on another corpus (gold answers and labels would not match).
 */
export const readDemonstrationRecording = async (directory: string): Promise<RecordingRead> => {
    const name = displayPath(repositoryRoot, directory);
    const read = await readFixtureSet(directory);
    if (read.kind === 'invalid') {
        return { kind: 'invalid', directory: name, reason: read.reason };
    }
    const foreign = read.fixtures.runs.find((run) => presetOfHarnessKey(run.labels.harnessKey) === null);
    if (foreign !== undefined) {
        return { kind: 'invalid', directory: name, reason: `run ${foreign.labels.runId} is not a demonstration run` };
    }
    const corpusHash = await corpusSha256();
    if (corpusHash !== read.fixtures.manifest.corpusSha256) {
        return {
            kind: 'invalid',
            directory: name,
            reason: `recorded on corpus sha256 ${read.fixtures.manifest.corpusSha256}, the corpus is now ${corpusHash}`,
        };
    }
    const spend = await readSpend(directory);
    return spend.kind === 'invalid'
        ? { kind: 'invalid', directory: name, reason: spend.reason }
        : { kind: 'read', recording: { fixtures: read.fixtures, spend: spend.spend, name } };
};
