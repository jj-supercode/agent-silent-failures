import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { gzipSync } from 'node:zlib';

import { describe, expect, test } from 'vitest';

import { readFixtureSet } from './fixture-reader.ts';
import { guardedProcessEnvironment } from './guarded-environment.ts';
import { fixtureFileNames } from './model.ts';
import { publishableFiles } from './publishable-files.ts';
import { sensitiveFindings } from './sensitive-strings.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

/**
 * The committed fixture budget, measured as a clone pays for it: git stores each file zlib-compressed, and the trace
 * lines compress about sixfold (2026-10-15: 9.8 MB of sets, 1.7 MB gzipped). 4 MiB leaves room for two more live
 * recordings of about 1 MiB gzipped each, plus their demonstrations.
 */
const maxCompressedFixtureBytes = 4 * 1024 * 1024;

const isFixtureFile = (file: string): boolean =>
    file.startsWith('fixtures/') && (file.endsWith('.json') || file.endsWith('.jsonl'));

/** The fixture files a commit would hold: rehearsals record outside the repository, and ignored files never count. */
const committedFiles = async (): Promise<readonly string[]> =>
    (await publishableFiles(repoRoot)).filter(isFixtureFile).map((file) => path.join(repoRoot, file));

const fixtureSetDirectories = async (): Promise<readonly string[]> =>
    (await committedFiles())
        .filter((file) => path.basename(file) === fixtureFileNames.manifest)
        .map((file) => path.dirname(file));

describe('committed fixtures', () => {
    test('there is at least one fixture set to replay', async () => {
        expect((await fixtureSetDirectories()).length).toBeGreaterThan(0);
    });

    test('every fixture set reads back whole under the current schema', async () => {
        const read = await Promise.all((await fixtureSetDirectories()).map(readFixtureSet));
        expect(read.filter((result) => result.kind === 'invalid')).toEqual([]);
    });

    test('no fixture holds an API key, an email, a home-directory path or a secret environment value', async () => {
        const environment = guardedProcessEnvironment();
        const findings = await Promise.all(
            (await committedFiles()).map(async (file) => ({
                file: path.relative(repoRoot, file),
                findings: sensitiveFindings(await readFile(file, 'utf8'), environment),
            })),
        );
        expect(findings.filter((found) => found.findings.length > 0)).toEqual([]);
    });

    test('the committed fixtures stay under 4 MiB compressed', async () => {
        const sizes = await Promise.all(
            (await committedFiles()).map(async (file) => gzipSync(await readFile(file)).byteLength),
        );
        expect(sizes.reduce((total, size) => total + size, 0)).toBeLessThan(maxCompressedFixtureBytes);
    });
});
