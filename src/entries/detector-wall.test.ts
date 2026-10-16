import { readdir } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { reachableModules } from '../live/boundary/module-imports.ts';

const entriesDirectory = import.meta.dirname;
const sourceDirectory = path.dirname(entriesDirectory);

const detectorFiles = (await readdir(entriesDirectory, { withFileTypes: true }))
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => path.join(entriesDirectory, dirent.name, 'detector.ts'));

/** What a detector may reach at run time, directly or through any module it imports. */
const allowedFor =
    (detectorFile: string) =>
    (file: string): boolean =>
        file === detectorFile ||
        file === path.join(path.dirname(detectorFile), 'model.ts') ||
        file === path.join(sourceDirectory, 'trace', 'model.ts') ||
        file === path.join(entriesDirectory, 'contract.ts') ||
        file === path.join(entriesDirectory, 'errors.ts') ||
        (path.dirname(file) === path.join(sourceDirectory, 'text') && !file.endsWith('.test.ts'));

const allowedPackages: ReadonlySet<string> = new Set(['zod']);

/**
 * The information wall, checked on the transitive runtime import graph (dynamic `import()` included), so a re-export
 * through `./model.ts` or a lazy import of the harness fails here even where the lexical lint rule cannot see it.
 */
describe('every detector reaches only the trace model, text helpers, its own model and zod', () => {
    test('finds every entry detector', () => {
        expect(detectorFiles.length).toBeGreaterThan(0);
    });

    test.each(detectorFiles.map((file) => [path.basename(path.dirname(file)), file] as const))(
        '%s',
        async (_, detectorFile) => {
            const graph = await reachableModules([detectorFile], { followDynamicImports: true });
            expect([...graph.files].filter((file) => !allowedFor(detectorFile)(file))).toEqual([]);
            expect([...graph.packages].filter((specifier) => !allowedPackages.has(specifier))).toEqual([]);
        },
    );
});
