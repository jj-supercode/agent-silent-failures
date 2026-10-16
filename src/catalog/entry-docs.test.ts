import { readdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { describe, expect, test } from 'vitest';

import { catalogEntries } from './index.ts';
import { entryDocMismatches, entryDocShapeProblems, parseEntryDoc, type EntryDoc } from './entry-doc.ts';

const entriesDirectory = join(import.meta.dirname, '..', 'entries');

const entryFolders = (await readdir(entriesDirectory, { withFileTypes: true }))
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

const readEntryDoc = async (folder: string): Promise<EntryDoc> => {
    const parsed = parseEntryDoc(await readFile(join(entriesDirectory, folder, 'README.md'), 'utf8'));
    if (parsed.kind === 'invalid') {
        throw new Error(`${folder}/README.md: ${parsed.reason}`);
    }
    return parsed.doc;
};

describe.each(entryFolders)('entry page %s/README.md', (folder) => {
    test('has valid frontmatter whose id names its folder', async () => {
        expect((await readEntryDoc(folder)).frontmatter.id).toBe(folder);
    });

    test('has the fixed sections in order and a results block', async () => {
        expect(entryDocShapeProblems(await readEntryDoc(folder))).toEqual([]);
    });
});

describe.each(catalogEntries.map((entry) => [entry.id, entry] as const))('registered entry %s', (id, entry) => {
    test('has a folder with a page', () => {
        expect(entryFolders).toContain(id);
    });

    test('is documented with the same description and thresholds it is defined with', async () => {
        expect(entryDocMismatches(await readEntryDoc(id), entry)).toEqual([]);
    });
});
