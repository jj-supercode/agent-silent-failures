import { readFile } from 'node:fs/promises';
import { arch, platform } from 'node:os';

import { z } from 'zod';

import type { ReportProvenance, RunSource } from '../model.ts';

const packageManifestSchema = z.object({ devDependencies: z.record(z.string(), z.string()) });

/** The pins that decide the numbers: Mastra packages, the embedder wrapper and the vector store. */
const reportedPackages = ['@mastra/core', '@mastra/rag', '@mastra/fastembed', '@mastra/libsql'] as const;

const packageManifestUrl = new URL('../../../package.json', import.meta.url);

/** Where and with what the numbers were produced. Pins are exact, so the manifest names the installed versions. */
export const currentProvenance = async (source: RunSource, now: Date): Promise<ReportProvenance> => {
    const manifest = packageManifestSchema.parse(JSON.parse(await readFile(packageManifestUrl, 'utf8')));
    return {
        source,
        platform: `${platform()} ${arch()}, Node ${process.version}`,
        generatedOn: now.toISOString().slice(0, 10),
        versions: Object.fromEntries(
            reportedPackages.map((name) => [name, manifest.devDependencies[name] ?? 'not installed']),
        ),
    };
};
