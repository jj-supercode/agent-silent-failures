import { constants } from 'node:fs';
import { copyFile, rename, writeFile } from 'node:fs/promises';
import path from 'node:path';

import { fixtureFileNames } from '../../record/index.ts';
import type { CompletedLine } from './recording-to-resume.ts';

/** The recording's `runs.jsonl` as the first resume found it; git-ignored, so a paid recording can always be recovered. */
export const runsBackupFileName = `${fixtureFileNames.runs}.before-resume`;

const isAlreadyThere = (error: unknown): boolean =>
    error instanceof Error && 'code' in error && error.code === 'EEXIST';

/** Copies `runs.jsonl` aside once; a later resume keeps the first backup, which holds the most. */
const backUpOnce = async (runsFile: string, backupFile: string): Promise<void> => {
    try {
        await copyFile(runsFile, backupFile, constants.COPYFILE_EXCL);
    } catch (error) {
        if (!isAlreadyThere(error)) {
            throw error;
        }
    }
};

/**
 * Leaves only the completed lines in `runs.jsonl`, byte for byte, so the failed and missing runs can be appended
 * again without a run appearing twice. The new file is written beside the old one and renamed over it, so an
 * interrupt leaves either the old file or the new one, never half of either.
 */
export const keepCompletedRuns = async (directory: string, completedLines: readonly CompletedLine[]): Promise<void> => {
    const runsFile = path.join(directory, fixtureFileNames.runs);
    await backUpOnce(runsFile, path.join(directory, runsBackupFileName));
    const rewritten = `${runsFile}.rewriting`;
    await writeFile(rewritten, completedLines.map((line) => `${line.text}\n`).join(''));
    await rename(rewritten, runsFile);
};
