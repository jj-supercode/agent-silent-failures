import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import {
    fixtureFileNames,
    fixtureManifestSchema,
    fixtureSchemaVersion,
    recordedRunSchema,
    type FixtureManifest,
    type RecordedRun,
} from './model.ts';

export type FixtureSet = {
    readonly directory: string;
    readonly manifest: FixtureManifest;
    readonly runs: readonly RecordedRun[];
};

export type FixtureSetResult =
    | { readonly kind: 'read'; readonly fixtures: FixtureSet }
    | { readonly kind: 'invalid'; readonly directory: string; readonly reason: string };

const schemaVersionSchema = z.object({ schemaVersion: z.int() });

/** JSON text as a value or the reason it is not JSON (a line cut short by an interrupted write, for one). */
export const parsedJson = (text: string): { readonly json: unknown } | { readonly problem: string } => {
    try {
        return { json: JSON.parse(text) };
    } catch (error) {
        return { problem: error instanceof Error ? error.message : String(error) };
    }
};

const decodeManifest = (text: string): FixtureManifest | string => {
    const parsed = parsedJson(text);
    if ('problem' in parsed) {
        return `manifest: ${parsed.problem}`;
    }
    const { json } = parsed;
    const version = schemaVersionSchema.safeParse(json);
    if (version.success && version.data.schemaVersion !== fixtureSchemaVersion) {
        return `fixture schema version ${version.data.schemaVersion} is not ${fixtureSchemaVersion}, the version this replay reads`;
    }
    const manifest = fixtureManifestSchema.safeParse(json);
    return manifest.success ? manifest.data : `manifest: ${z.prettifyError(manifest.error)}`;
};

type DecodedLine = { readonly run: RecordedRun } | { readonly problem: string };

type NumberedLine = { readonly text: string; readonly lineNumber: number };

const decodeRunLine = ({ text, lineNumber }: NumberedLine): DecodedLine => {
    const parsed = parsedJson(text);
    if ('problem' in parsed) {
        return { problem: `${fixtureFileNames.runs} line ${lineNumber}: ${parsed.problem}` };
    }
    const run = recordedRunSchema.safeParse(parsed.json);
    return run.success
        ? { run: run.data }
        : { problem: `${fixtureFileNames.runs} line ${lineNumber}: ${z.prettifyError(run.error)}` };
};

/** Lines are numbered before blank ones are dropped, so a reported line number is the physical line in the file. */
const decodeRunLines = (text: string): readonly RecordedRun[] | string => {
    const decoded = text
        .split('\n')
        .map((line, index): NumberedLine => ({ text: line, lineNumber: index + 1 }))
        .filter((line) => line.text.trim().length > 0)
        .map(decodeRunLine);
    const problem = decoded.find((line) => 'problem' in line);
    return problem !== undefined && 'problem' in problem
        ? problem.problem
        : decoded.flatMap((line) => ('run' in line ? [line.run] : []));
};

const readText = (file: string): Promise<string | null> => readFile(file, 'utf8').catch(() => null);

/** Reads and validates one fixture directory; every problem is a value, never a partial set. */
export const readFixtureSet = async (directory: string): Promise<FixtureSetResult> => {
    const manifestText = await readText(path.join(directory, fixtureFileNames.manifest));
    const runsText = await readText(path.join(directory, fixtureFileNames.runs));
    if (manifestText === null || runsText === null) {
        return {
            kind: 'invalid',
            directory,
            reason: `a fixture set needs both ${fixtureFileNames.manifest} and ${fixtureFileNames.runs}`,
        };
    }
    const manifest = decodeManifest(manifestText);
    if (typeof manifest === 'string') {
        return { kind: 'invalid', directory, reason: manifest };
    }
    const runs = decodeRunLines(runsText);
    if (typeof runs === 'string') {
        return { kind: 'invalid', directory, reason: runs };
    }
    return runs.length === manifest.recordedRuns
        ? { kind: 'read', fixtures: { directory, manifest, runs } }
        : {
              kind: 'invalid',
              directory,
              reason: `the manifest records ${manifest.recordedRuns} runs, ${fixtureFileNames.runs} holds ${runs.length}`,
          };
};
