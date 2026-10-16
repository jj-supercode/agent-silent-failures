import { mkdir, mkdtempDisposable, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { defaultFixtureDirectory } from './fixture-location.ts';

const fixtureSet = async (root: string, mode: 'live' | 'dry-run', date: string, withManifest: boolean) => {
    const directory = path.join(root, mode, date);
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, 'runs.jsonl'), '');
    if (withManifest) {
        await writeFile(path.join(directory, 'manifest.json'), '{}');
    }
    return directory;
};

describe('defaultFixtureDirectory', () => {
    test('prefers the newest live set', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'fixtures-'));
        await fixtureSet(root.path, 'dry-run', '2026-10-15', true);
        await fixtureSet(root.path, 'live', '2026-10-13', true);
        const newest = await fixtureSet(root.path, 'live', '2026-10-14', true);
        expect(await defaultFixtureDirectory(root.path)).toBe(newest);
    });

    test('skips a dated directory a refused start left without a manifest', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'fixtures-'));
        const dryRun = await fixtureSet(root.path, 'dry-run', '2026-10-14', true);
        await fixtureSet(root.path, 'live', '2026-10-15', false);
        expect(await defaultFixtureDirectory(root.path)).toBe(dryRun);
    });

    test('finds nothing when no set holds a manifest', async () => {
        await using root = await mkdtempDisposable(path.join(tmpdir(), 'fixtures-'));
        await fixtureSet(root.path, 'live', '2026-10-15', false);
        expect(await defaultFixtureDirectory(root.path)).toBeNull();
    });
});
