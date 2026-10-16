import { readFile } from 'node:fs/promises';
import { homedir, userInfo } from 'node:os';
import path from 'node:path';

import { describe, expect, test } from 'vitest';

import { isIgnored, parseIgnoreRules } from './ignore-rules.ts';
import { publishableFiles } from './publishable-files.ts';

const repoRoot = path.resolve(import.meta.dirname, '../..');

/** Account names of CI runners and containers; they occur in ordinary text, so only the home path is checked for them. */
const sharedAccountNames: ReadonlySet<string> = new Set(['root', 'node', 'runner', 'user', 'admin', 'ubuntu']);

const escapedForPattern = (text: string): string => text.replaceAll(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Whether text names whoever runs this check: their home path, or their user name as a whole word. */
const namesTheRunner = (): ((text: string) => boolean) => {
    const home = homedir();
    const { username } = userInfo();
    const wholeUsername = sharedAccountNames.has(username)
        ? null
        : new RegExp(`\\b${escapedForPattern(username)}\\b`, 'i');
    return (text) => text.includes(home) || (wholeUsername?.test(text) ?? false);
};

/** Local state that must never reach a commit or an image: Vitest JSON reports (`/Users/...` paths) and Finder files. */
const localStatePaths = [
    { path: '.vitest', isDirectory: true },
    { path: 'docs/.DS_Store', isDirectory: false },
] as const;

describe('the files a commit would publish', () => {
    test('no file git would stage holds the home path or the user name of whoever runs the check', async () => {
        const leaks = namesTheRunner();
        const files = await publishableFiles(repoRoot);
        const leaking = await Promise.all(
            files.map(async (file) =>
                leaks((await readFile(path.join(repoRoot, file))).toString('latin1')) ? [file] : [],
            ),
        );
        expect(files.length).toBeGreaterThan(0);
        expect(leaking.flat()).toEqual([]);
    });

    test.each(
        ['.gitignore', '.dockerignore'].flatMap((ignoreFile) =>
            localStatePaths.map((local) => ({ ignoreFile, ...local })),
        ),
    )('$ignoreFile keeps out $path', async ({ ignoreFile, path: localPath, isDirectory }) => {
        const rules = parseIgnoreRules(await readFile(path.join(repoRoot, ignoreFile), 'utf8'));
        expect(isIgnored(rules, localPath, isDirectory)).toBe(true);
    });
});
