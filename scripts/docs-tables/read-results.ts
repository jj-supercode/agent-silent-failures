import { readdir, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

import type { z } from 'zod';

import { reproReportSchema, type ReproReport } from './model.ts';

export type ReadResult<T> =
    | { readonly kind: 'read'; readonly value: T }
    | { readonly kind: 'invalid'; readonly path: string; readonly reason: string };

export const resultsDirectory = new URL('../../results/', import.meta.url);

const displayPath = (url: URL): string => fileURLToPath(url);

const parseJson = (
    text: string,
): { readonly kind: 'parsed'; readonly value: unknown } | { readonly kind: 'malformed'; readonly reason: string } => {
    try {
        return { kind: 'parsed', value: JSON.parse(text) };
    } catch (error) {
        return { kind: 'malformed', reason: String(error) };
    }
};

/** Reads one generated JSON file and validates it; a missing or malformed file is a result, not a throw. */
export const readResultFile = async <TSchema extends z.ZodType>(
    url: URL,
    schema: TSchema,
): Promise<ReadResult<z.infer<TSchema>>> => {
    const text = await readFile(url, 'utf8').then(
        (content) => ({ kind: 'text', content }) as const,
        (error: unknown) => ({ kind: 'unreadable', reason: String(error) }) as const,
    );
    if (text.kind === 'unreadable') {
        return { kind: 'invalid', path: displayPath(url), reason: text.reason };
    }
    const json = parseJson(text.content);
    if (json.kind === 'malformed') {
        return { kind: 'invalid', path: displayPath(url), reason: json.reason };
    }
    const parsed = schema.safeParse(json.value);
    return parsed.success
        ? { kind: 'read', value: parsed.data }
        : { kind: 'invalid', path: displayPath(url), reason: parsed.error.message };
};

/** Validates a repro report's evidence against the shape the docs quote from it. */
export const reproEvidence = <TSchema extends z.ZodType>(
    report: ReproReport,
    schema: TSchema,
): ReadResult<{ readonly report: ReproReport; readonly evidence: z.infer<TSchema> }> => {
    const parsed = schema.safeParse(report.evidence);
    return parsed.success
        ? { kind: 'read', value: { report, evidence: parsed.data } }
        : { kind: 'invalid', path: `results/repros/${report.reproductionId}.json`, reason: parsed.error.message };
};

const isInvalid = <T>(result: ReadResult<T>): result is Extract<ReadResult<T>, { kind: 'invalid' }> =>
    result.kind === 'invalid';

const reproReportsDirectory = new URL('repros/', resultsDirectory);

/** Every repro report, sorted by id. */
export const readReproReports = async (): Promise<ReadResult<readonly ReproReport[]>> => {
    const listing = await readdir(reproReportsDirectory).then(
        (names) => ({ kind: 'listed', names }) as const,
        (error: unknown) => ({ kind: 'unreadable', reason: String(error) }) as const,
    );
    if (listing.kind === 'unreadable') {
        return { kind: 'invalid', path: displayPath(reproReportsDirectory), reason: listing.reason };
    }
    const names = listing.names.filter((name) => name.endsWith('.json')).toSorted();
    const results = await Promise.all(
        names.map((name) => readResultFile(new URL(name, reproReportsDirectory), reproReportSchema)),
    );
    const invalid = results.find(isInvalid);
    return (
        invalid ?? { kind: 'read', value: results.flatMap((result) => (result.kind === 'read' ? [result.value] : [])) }
    );
};
