import { readFile } from 'node:fs/promises';

import { ReproSetupError } from '../shared/errors.ts';

export const originOfSpeciesFile = new URL('../corpus/origin-of-species.txt', import.meta.url);

const bodyStartMarker = /^\*\*\* START OF THE PROJECT GUTENBERG EBOOK .*\*\*\*$/m;
const bodyEndMarker = /^\*\*\* END OF THE PROJECT GUTENBERG EBOOK .*\*\*\*$/m;

/** Returns the book text without the Project Gutenberg header and license footer. */
export const gutenbergBody = (fullText: string): string => {
    const start = bodyStartMarker.exec(fullText);
    const end = bodyEndMarker.exec(fullText);
    if (start === null || end === null) {
        throw new ReproSetupError('Project Gutenberg start or end marker not found');
    }
    return fullText.slice(start.index + start[0].length, end.index).trim();
};

export const loadOriginOfSpecies = async (): Promise<string> =>
    gutenbergBody(await readFile(originOfSpeciesFile, 'utf8'));
