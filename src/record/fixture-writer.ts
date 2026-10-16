import { appendFile, mkdir, stat, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { SensitiveFixtureError } from './errors.ts';
import type { EnvironmentValues } from './guarded-environment.ts';
import { fixtureFileNames, type FixtureManifest, type RecordedRunInput } from './model.ts';
import { sensitiveFindings, type SensitiveFinding } from './sensitive-strings.ts';

const checkedText = (file: string, text: string, environment: EnvironmentValues): string => {
    const findings = sensitiveFindings(text, environment);
    if (findings.length > 0) {
        throw new SensitiveFixtureError(file, findings);
    }
    return text;
};

export type FixtureStart = { readonly kind: 'started' } | { readonly kind: 'exists'; readonly directory: string };

/**
 * Opens a fixture directory for a new recording. `replace: false` refuses a directory that already holds at least one
 * run, so a second session never overwrites a paid recording (an attempt that recorded nothing may be retried); a dry
 * run, which is free to regenerate, replaces.
 */
export const startFixtureSet = async (
    directory: string,
    { replace }: { readonly replace: boolean },
): Promise<FixtureStart> => {
    const runsFile = path.join(directory, fixtureFileNames.runs);
    const existing = await stat(runsFile).catch(() => null);
    if (!replace && existing !== null && existing.size > 0) {
        return { kind: 'exists', directory };
    }
    await mkdir(directory, { recursive: true });
    await writeFile(runsFile, '');
    return { kind: 'started' };
};

export type AppendResult =
    { readonly kind: 'written' } | { readonly kind: 'withheld'; readonly findings: readonly SensitiveFinding[] };

const withheldRun = (run: RecordedRunInput, findings: readonly SensitiveFinding[]): RecordedRunInput => ({
    labels: run.labels,
    outcome: {
        kind: 'failed',
        reason: `withheld from the fixture: it matched ${[...new Set(findings.map((finding) => finding.kind))].join(', ')}`,
    },
});

/**
 * Appends one run as it finishes, so a session stopped early keeps everything recorded before the stop. A run whose
 * line looks sensitive is withheld: a failed line with the reason (never the content) takes its place, so the
 * session goes on and the run still counts.
 */
export const appendRecordedRun = async (
    directory: string,
    run: RecordedRunInput,
    environment: EnvironmentValues,
): Promise<AppendResult> => {
    const file = path.join(directory, fixtureFileNames.runs);
    const line = JSON.stringify(run);
    const findings = sensitiveFindings(line, environment);
    if (findings.length === 0) {
        await appendFile(file, `${line}\n`);
        return { kind: 'written' };
    }
    await appendFile(file, `${checkedText(file, JSON.stringify(withheldRun(run, findings)), environment)}\n`);
    return { kind: 'withheld', findings };
};

export const writeFixtureJson = async (
    directory: string,
    fileName: string,
    value: unknown,
    environment: EnvironmentValues,
): Promise<void> => {
    const file = path.join(directory, fileName);
    await writeFile(file, `${checkedText(file, JSON.stringify(value, null, 4), environment)}\n`);
};

export const writeFixtureManifest = (
    directory: string,
    manifest: FixtureManifest,
    environment: EnvironmentValues,
): Promise<void> => writeFixtureJson(directory, fixtureFileNames.manifest, manifest, environment);
