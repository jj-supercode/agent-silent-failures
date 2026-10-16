import { mkdir, writeFile } from 'node:fs/promises';
import { arch, platform, release } from 'node:os';
import { fileURLToPath } from 'node:url';

import { format, resolveConfig } from 'prettier';

import { installedVersions } from '../../src/record/index.ts';
import { exitCodeFor, type ReproductionOutcome } from './reproduction-outcome.ts';

/** The packages whose behaviour the repros pin, in the order reports list them. */
const reportedPackages = [
    '@mastra/core',
    '@mastra/evals',
    '@mastra/fastembed',
    '@mastra/libsql',
    '@mastra/memory',
    '@mastra/observability',
    '@mastra/rag',
    'ai',
] as const;

/** Every repro writes its report here; `pnpm docs:tables` reads the published numbers from these files. */
const reproResultsDirectory = new URL('../../results/repros/', import.meta.url);

export const reproReportPath = (reproductionId: string): string =>
    fileURLToPath(new URL(`${reproductionId}.json`, reproResultsDirectory));

const formattedJson = async (path: string, value: unknown): Promise<string> =>
    format(JSON.stringify(value), { ...(await resolveConfig(path)), filepath: path });

/** Writes the report file, prints its summary line and sets the process exit code from the outcome. */
export const reportOutcome = async (reproductionId: string, outcome: ReproductionOutcome): Promise<void> => {
    const path = reproReportPath(reproductionId);
    const report = {
        reproductionId,
        outcome: outcome.kind,
        summary: outcome.summary,
        source: 'scripted',
        platform: `${platform()} ${release()} ${arch()}, Node ${process.version}`,
        generatedOn: new Date().toISOString().slice(0, 10),
        versions: installedVersions(reportedPackages),
        evidence: outcome.evidence,
    };
    await mkdir(reproResultsDirectory, { recursive: true });
    await writeFile(path, await formattedJson(path, report));
    console.log(`${reproductionId}: ${outcome.summary}`);
    process.exitCode = exitCodeFor(outcome);
};
