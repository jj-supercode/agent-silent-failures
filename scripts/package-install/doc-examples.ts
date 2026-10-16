import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

/** A fenced `ts` block from a published page, written out as one module of the consumer project. */
export type DocExample = { readonly fileName: string; readonly source: string };

const typescriptFence = /^```ts\n([\s\S]*?)^```/gm;

/** The bodies of the ```` ```ts ```` blocks of a markdown page, in page order. */
export const typescriptBlocks = (markdown: string): readonly string[] =>
    Array.from(markdown.matchAll(typescriptFence), ([, body]) => body ?? '');

/** The package a bare import specifier names: `@scope/name/sub` is `@scope/name`, `name/sub` is `name`. */
export const packageOf = (specifier: string): string =>
    specifier
        .split('/')
        .slice(0, specifier.startsWith('@') ? 2 : 1)
        .join('/');

/** Every package a block imports by a bare specifier (`node:` built-ins excluded). */
export const importedPackages = (source: string): readonly string[] => [
    ...new Set(
        Array.from(source.matchAll(/\bfrom\s+'([^'.][^']*)'/g), ([, specifier]) => specifier ?? '')
            .filter((specifier) => specifier.length > 0 && !specifier.startsWith('node:'))
            .map(packageOf),
    ),
];

const examplesOfPage = async (repoRoot: string, page: string): Promise<readonly DocExample[]> =>
    typescriptBlocks(await readFile(path.join(repoRoot, page), 'utf8')).map((source, index) => ({
        fileName: `doc-${page.replaceAll(/[^a-z0-9]+/gi, '-').toLowerCase()}-${index + 1}.ts`,
        source,
    }));

/** The published pages whose code users copy: the README and every entry page. */
export const docExamples = async (repoRoot: string): Promise<readonly DocExample[]> => {
    const entryFolders = (await readdir(path.join(repoRoot, 'src', 'entries'), { withFileTypes: true }))
        .filter((dirent) => dirent.isDirectory())
        .map((dirent) => path.join('src', 'entries', dirent.name, 'README.md'));
    return (await Array.fromAsync(['README.md', ...entryFolders], (page) => examplesOfPage(repoRoot, page))).flat();
};
