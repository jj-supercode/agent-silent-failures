import { readFile } from 'node:fs/promises';
import path from 'node:path';

import { z } from 'zod';

import type { RunId } from '../../bed/index.ts';
import { fixtureFileNames, recordedRunSchema } from '../../record/index.ts';
import { sessionManifestSchema } from '../fixture-manifest.ts';
import { recordedSpendSchema, type RecordedSpend } from '../spend-summary.ts';

/** A completed run's line, kept byte for byte: a resumed session never rewrites or re-sends a completed run. */
export type CompletedLine = { readonly runId: RunId; readonly text: string };

export type RecordingToResume = {
    readonly directory: string;
    readonly manifest: z.infer<typeof sessionManifestSchema>;
    readonly completedLines: readonly CompletedLine[];
    /** Failed lines, to be re-run, plus a last line cut short by an interrupted write. */
    readonly droppedLines: number;
    readonly spend: RecordedSpend;
};

export type RecordingRead =
    | { readonly kind: 'read'; readonly recording: RecordingToResume }
    | { readonly kind: 'invalid'; readonly reason: string };

type DecodedLine =
    | { readonly kind: 'completed'; readonly line: CompletedLine }
    | { readonly kind: 'failed'; readonly runId: RunId }
    | { readonly kind: 'unreadable'; readonly lineNumber: number; readonly problem: string };

const parsedJson = (text: string): { readonly json: unknown } | { readonly problem: string } => {
    try {
        return { json: JSON.parse(text) };
    } catch (error) {
        return { problem: error instanceof Error ? error.message : String(error) };
    }
};

const decodeLine = (text: string, lineNumber: number): DecodedLine => {
    const parsed = parsedJson(text);
    if ('problem' in parsed) {
        return { kind: 'unreadable', lineNumber, problem: parsed.problem };
    }
    const run = recordedRunSchema.safeParse(parsed.json);
    if (!run.success) {
        return { kind: 'unreadable', lineNumber, problem: z.prettifyError(run.error) };
    }
    return run.data.outcome.kind === 'completed'
        ? { kind: 'completed', line: { runId: run.data.labels.runId, text } }
        : { kind: 'failed', runId: run.data.labels.runId };
};

/**
 * Decodes `runs.jsonl`. Every line the recorder finished ends with a newline, so an unreadable last line without one
 * was cut short by an interrupt and is dropped (its run is re-run); any other unreadable line refuses the resume.
 */
const decodeRuns = (
    text: string,
): { readonly completed: readonly CompletedLine[]; readonly dropped: number } | { readonly problem: string } => {
    const lines = text.split('\n');
    const decoded = lines.map((line, index) =>
        line.trim().length === 0
            ? null
            : { decoded: decodeLine(line, index + 1), isCutShort: index === lines.length - 1 },
    );
    const present = decoded.flatMap((line) => (line === null ? [] : [line]));
    const unreadable = present.find((line) => line.decoded.kind === 'unreadable' && !line.isCutShort);
    if (unreadable !== undefined && unreadable.decoded.kind === 'unreadable') {
        return {
            problem: `${fixtureFileNames.runs} line ${unreadable.decoded.lineNumber}: ${unreadable.decoded.problem}`,
        };
    }
    const completed = present.flatMap(({ decoded: line }) => (line.kind === 'completed' ? [line.line] : []));
    const duplicate = [...Map.groupBy(completed, (line) => line.runId)].find(([, lines]) => lines.length > 1);
    return duplicate === undefined
        ? { completed, dropped: present.length - completed.length }
        : { problem: `${fixtureFileNames.runs} holds run ${duplicate[0]} as completed twice` };
};

const readText = (file: string): Promise<string | null> => readFile(file, 'utf8').catch(() => null);

const decodeJson = <T>(text: string, schema: z.ZodType<T>, file: string): T | string => {
    const parsed = parsedJson(text);
    if ('problem' in parsed) {
        return `${file}: ${parsed.problem}`;
    }
    const decoded = schema.safeParse(parsed.json);
    return decoded.success ? decoded.data : `${file}: ${z.prettifyError(decoded.error)}`;
};

/**
 * Reads a recording to resume, with or without the final manifest write: unlike replay, it does not need the
 * manifest's run count to match, because an interrupt may land between a run's line and the manifest rewrite.
 */
export const readRecordingToResume = async (directory: string): Promise<RecordingRead> => {
    const fileText = (file: string) => readText(path.join(directory, file));
    const [manifestText, runsText, spendText] = await Promise.all([
        fileText(fixtureFileNames.manifest),
        fileText(fixtureFileNames.runs),
        fileText(fixtureFileNames.spend),
    ]);
    if (manifestText === null || runsText === null || spendText === null) {
        return {
            kind: 'invalid',
            reason: `${directory} holds no complete recording to resume (it needs ${fixtureFileNames.manifest}, ${fixtureFileNames.runs} and ${fixtureFileNames.spend}); start a new session instead`,
        };
    }
    const manifest = decodeJson(manifestText, sessionManifestSchema, fixtureFileNames.manifest);
    const spend = decodeJson(spendText, recordedSpendSchema, fixtureFileNames.spend);
    const runs = decodeRuns(runsText);
    if (typeof manifest === 'string') {
        return { kind: 'invalid', reason: manifest };
    }
    if (typeof spend === 'string') {
        return { kind: 'invalid', reason: spend };
    }
    if ('problem' in runs) {
        return { kind: 'invalid', reason: runs.problem };
    }
    return {
        kind: 'read',
        recording: { directory, manifest, completedLines: runs.completed, droppedLines: runs.dropped, spend },
    };
};
