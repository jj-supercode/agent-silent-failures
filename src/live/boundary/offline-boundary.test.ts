import { glob, readFile } from 'node:fs/promises';
import path from 'node:path';

import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import { moduleImports, reachableModules } from './module-imports.ts';

const repoRoot = path.resolve(import.meta.dirname, '../../..');
const fromRoot = (relative: string): string => path.join(repoRoot, relative);

const liveDirectory = fromRoot('src/live');
const liveEntry = fromRoot('src/live/main.ts');
const sessionPlanModule = fromRoot('src/live/session-plan.ts');
const providerModule = fromRoot('src/live/anthropic-model.ts');
const providerPackage = '@ai-sdk/anthropic';
const liveScripts: ReadonlySet<string> = new Set(['demo:live', 'studio:live', 'demonstration:live']);
const scriptedStudioEntry = fromRoot('src/mastra/index.ts');
const liveStudioDirectory = fromRoot('src/mastra-live');
const liveStudioEntry = fromRoot('src/mastra-live/index.ts');

const packageScriptsSchema = z.object({ scripts: z.record(z.string(), z.string()) });

const packageScripts = async (): Promise<ReadonlyMap<string, string>> =>
    new Map(
        Object.entries(
            packageScriptsSchema.parse(JSON.parse(await readFile(fromRoot('package.json'), 'utf8'))).scripts,
        ),
    );

/** Every `node <file>.ts` and `--config <file>` a script runs, and the `index.ts` of every `mastra dev --dir`. */
const scriptEntryFiles = (command: string): readonly string[] => [
    ...Array.from(command.matchAll(/(?:\bnode|--config)\s+(\S+\.ts)\b/g), (match) => fromRoot(match[1] ?? '')),
    ...Array.from(command.matchAll(/\bmastra dev\b.*?--dir\s+(\S+)/g), (match) =>
        path.join(fromRoot(match[1] ?? ''), 'index.ts'),
    ),
];

const mastraDevScripts = async (): Promise<readonly (readonly [string, string])[]> =>
    [...(await packageScripts())].filter(([, command]) => /\bmastra dev\b/.test(command));

/** The package scripts the Docker image runs by default, e.g. `CMD ["pnpm", "demo"]`. */
const dockerCommandScripts = async (): Promise<readonly string[]> => {
    const dockerfile = await readFile(fromRoot('Dockerfile'), 'utf8');
    return Array.from(dockerfile.matchAll(/^CMD\s+\["pnpm",\s*"([^"]+)"/gm), (match) => match[1] ?? '');
};

const filesMatching = async (patterns: readonly string[]): Promise<readonly string[]> =>
    (await Array.fromAsync(glob(patterns, { cwd: repoRoot }))).map(fromRoot);

const offlineScriptEntries = async (): Promise<readonly string[]> => {
    const scripts = await packageScripts();
    return [...scripts].filter(([name]) => !liveScripts.has(name)).flatMap(([, command]) => scriptEntryFiles(command));
};

const isInside = (directory: string, file: string): boolean => file.startsWith(`${directory}${path.sep}`);

/** Entry points no package script names: `pnpm repros` spawns each `repros/<id>/repro.ts` as a child process. */
const spawnedEntries = (): Promise<readonly string[]> => filesMatching(['repros/*/repro.ts']);

/**
 * Each check parses the import graph of many files: the slowest takes 0.17 s alone, but one once took 5.02 s while
 * `pnpm test` ran every file in parallel on a busy machine, past Vitest's 5 s default.
 */
const graphScanTimeoutMilliseconds = 30_000;

describe('offline boundary', { timeout: graphScanTimeoutMilliseconds }, () => {
    test('finds the offline entry points it checks (demo, replay, Studio, tests, Vitest configs)', async () => {
        const entries = await offlineScriptEntries();
        expect(entries).toContain(fromRoot('src/demo/main.ts'));
        expect(entries).toContain(scriptedStudioEntry);
        expect(entries).toContain(fromRoot('src/replay/main.ts'));
        expect(entries).toContain(fromRoot('vitest.integration.config.ts'));
    });

    test('no offline script, Vitest config or Docker command can reach the live module or the provider', async () => {
        const scripts = await packageScripts();
        const dockerEntries = (await dockerCommandScripts()).flatMap((name) =>
            scriptEntryFiles(scripts.get(name) ?? ''),
        );
        const entries = [
            ...(await offlineScriptEntries()),
            ...dockerEntries,
            ...(await spawnedEntries()),
            ...(await filesMatching(['vitest.config.ts', 'vitest.integration.config.ts'])),
        ];
        const graph = await reachableModules(entries, { followDynamicImports: true });
        expect([...graph.files].filter((file) => isInside(liveDirectory, file))).toEqual([]);
        expect([...graph.packages]).not.toContain(providerPackage);
        expect([...graph.packages]).not.toContain('<computed>');
    });

    test('covers the entry points scripts start indirectly: every repro', async () => {
        expect(await spawnedEntries()).toContain(fromRoot('repros/fastembed-truncation/repro.ts'));
    });

    test('the key-free Studio project reaches neither the live module nor the live Studio project', async () => {
        const graph = await reachableModules([scriptedStudioEntry], { followDynamicImports: true });
        expect([...graph.files].filter((file) => isInside(liveDirectory, file))).toEqual([]);
        expect([...graph.files].filter((file) => isInside(liveStudioDirectory, file))).toEqual([]);
        expect([...graph.packages]).not.toContain(providerPackage);
    });

    test('the live Studio project is the only Studio project that reaches the provider', async () => {
        const scripts = await packageScripts();
        expect(scriptEntryFiles(scripts.get('studio:live') ?? '')).toContain(liveStudioEntry);
        const graph = await reachableModules([liveStudioEntry], { followDynamicImports: true });
        expect([...graph.files]).toContain(providerModule);
    });

    test('every Studio script tells Mastra to skip its own env-file loading and telemetry', async () => {
        const studioScripts = await mastraDevScripts();
        expect(studioScripts.map(([name]) => name)).toEqual(['studio', 'studio:live']);
        studioScripts.forEach(([, command]) => {
            expect(command).toMatch(/\bMASTRA_SKIP_DOTENV=1\b/);
            expect(command).toMatch(/\bMASTRA_TELEMETRY_DISABLED=1\b/);
        });
    });

    test('a live session loads its key before it creates or rewrites the fixture directory', async () => {
        const source = await readFile(liveEntry, 'utf8');
        const keyLoad = source.indexOf('await loadSessionModels(');
        expect(keyLoad).toBeGreaterThan(-1);
        expect(keyLoad).toBeLessThan(source.indexOf('await plan.open('));
        // Planning only reads: the directory is first written inside a plan's `open`, which the entry calls last.
        const planning = await readFile(sessionPlanModule, 'utf8');
        const firstOpen = planning.indexOf('open: async');
        expect(firstOpen).toBeGreaterThan(-1);
        ['await startFixtureSet(', 'await keepCompletedRuns('].forEach((write) =>
            expect(planning.indexOf(write)).toBeGreaterThan(firstOpen),
        );
    });

    test.each(['.gitignore', '.dockerignore'])(
        '%s keeps every env file but the example out, whatever its suffix',
        async (ignoreFile) => {
            const patterns = (await readFile(fromRoot(ignoreFile), 'utf8')).split('\n');
            expect(patterns).toContain('.env*');
            expect(patterns).toContain('!.env.example');
        },
    );

    test('the Docker build context leaves out the git history', async () => {
        expect((await readFile(fromRoot('.dockerignore'), 'utf8')).split('\n')).toContain('.git');
    });

    test.each([...liveScripts])('the Docker image never runs %s', async (liveScript) => {
        expect(await dockerCommandScripts()).not.toContain(liveScript);
        expect(await readFile(fromRoot('Dockerfile'), 'utf8')).not.toContain(liveScript);
    });

    test('no test file can reach the provider module, even through a dynamic import', async () => {
        const tests = await filesMatching(['src/**/*.test.ts', 'scripts/**/*.test.ts']);
        const graph = await reachableModules(tests, { followDynamicImports: true });
        expect([...graph.files]).not.toContain(providerModule);
        expect([...graph.files]).not.toContain(liveEntry);
        expect([...graph.packages]).not.toContain(providerPackage);
    });

    test('a dry run never loads the provider: the live entry reaches it only by a dynamic import', async () => {
        const staticGraph = await reachableModules([liveEntry], { followDynamicImports: false });
        expect([...staticGraph.files]).not.toContain(providerModule);
        expect([...staticGraph.packages]).not.toContain(providerPackage);
        const fullGraph = await reachableModules([liveEntry], { followDynamicImports: true });
        expect([...fullGraph.files]).toContain(providerModule);
    });

    test('only the provider module imports the provider package or reads an env file', async () => {
        const sources = await filesMatching(['src/**/*.ts', 'scripts/**/*.ts', '*.ts']);
        const touching = await Promise.all(
            sources.map(async (file) => {
                const text = await readFile(file, 'utf8');
                const importsProvider = moduleImports(file, text).some((found) => found.specifier === providerPackage);
                const readsEnvFile = /\b(?:loadEnvFile|parseEnv)\b|dotenv/.test(text);
                return importsProvider || readsEnvFile ? [file] : [];
            }),
        );
        const testFile = fromRoot('src/live/boundary/offline-boundary.test.ts');
        expect(touching.flat().filter((file) => file !== testFile)).toEqual([providerModule]);
    });

    test('no package script loads an env file', async () => {
        const commands = [...(await packageScripts()).values()];
        expect(
            commands.filter((command) => /--env-file|dotenv|\bmastra dev\b.*\s(?:--env|-e)\b/.test(command)),
        ).toEqual([]);
    });
});
