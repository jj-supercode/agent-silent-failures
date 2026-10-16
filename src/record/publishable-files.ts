import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

import { isIgnored, parseIgnoreRules, type IgnoreRule } from './ignore-rules.ts';

/** Git's own directory is never content. */
const gitDirectory = '.git';

const filesUnder = async (
    root: string,
    rules: readonly IgnoreRule[],
    directory: string,
): Promise<readonly string[]> => {
    const entries = await readdir(path.join(root, directory), { withFileTypes: true });
    const nested = await Promise.all(
        entries
            .map((entry) => ({ entry, relativePath: path.posix.join(directory, entry.name) }))
            .filter(
                ({ entry, relativePath }) =>
                    entry.name !== gitDirectory && !isIgnored(rules, relativePath, entry.isDirectory()),
            )
            .map(({ entry, relativePath }) =>
                entry.isDirectory() ? filesUnder(root, rules, relativePath) : Promise.resolve([relativePath]),
            ),
    );
    return nested.flat();
};

/**
 * Every file under `root` that `git add -A` would stage in a fresh repository: the working tree minus what the root
 * `.gitignore` excludes. Paths are relative to `root`, with POSIX separators.
 */
export const publishableFiles = async (root: string): Promise<readonly string[]> =>
    filesUnder(root, parseIgnoreRules(await readFile(path.join(root, '.gitignore'), 'utf8')), '');
