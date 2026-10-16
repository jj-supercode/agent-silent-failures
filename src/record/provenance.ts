import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import os from 'node:os';

import { z } from 'zod';

import { defaultQuestionsPath } from '../corpus/index.ts';
import type { FixtureManifest } from './model.ts';

/** The packages whose versions shape a recorded trace or its scoring. */
export const tracedPackages = [
    '@mastra/core',
    '@mastra/observability',
    '@mastra/rag',
    '@mastra/libsql',
    '@mastra/fastembed',
    'ai',
] as const;

const packageVersionSchema = z.object({ version: z.string().min(1) });

/** Reads versions from each package's own `package.json` (a JSON read, never an import of the package code). */
export const installedVersions = (packages: readonly string[]): Readonly<Record<string, string>> => {
    const require = createRequire(import.meta.url);
    return Object.fromEntries(
        packages.map((name) => [name, packageVersionSchema.parse(require(`${name}/package.json`)).version]),
    );
};

export const currentPlatform = (): FixtureManifest['platform'] => ({
    os: `${os.platform()} ${os.release()}`,
    arch: os.arch(),
    node: process.version,
});

export const corpusSha256 = async (corpusPath: URL | string = defaultQuestionsPath): Promise<string> =>
    createHash('sha256')
        .update(await readFile(corpusPath))
        .digest('hex');
