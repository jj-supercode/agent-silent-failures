import { access, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const reprosDirectory = new URL('../', import.meta.url);
const reproScriptName = 'repro.ts';

export const reproScriptPath = (reproductionId: string): string =>
    fileURLToPath(new URL(`${reproductionId}/${reproScriptName}`, reprosDirectory));

const hasReproScript = (folder: string): Promise<boolean> =>
    access(reproScriptPath(folder)).then(
        () => true,
        () => false,
    );

/** A repro is any folder holding a `repro.ts`; shared code and the corpus have none. */
export const reproductionIds = async (): Promise<readonly string[]> => {
    const folders = (await readdir(reprosDirectory, { withFileTypes: true }))
        .filter((entry) => entry.isDirectory())
        .map((entry) => entry.name);
    const withScript = await Promise.all(
        folders.map(async (folder) => ((await hasReproScript(folder)) ? [folder] : [])),
    );
    return withScript.flat().toSorted();
};
