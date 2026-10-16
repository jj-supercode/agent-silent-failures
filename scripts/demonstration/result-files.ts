import { fileURLToPath } from 'node:url';

import { writeFormattedFile } from '../../src/bed/index.ts';
import type { DemonstrationReport } from '../../src/studio/demonstration/index.ts';

/** Where each matrix is committed; `pnpm docs:tables` renders the README table from both. */
export const demonstrationResultFiles = {
    scripted: fileURLToPath(new URL('../../results/demonstration/scripted.json', import.meta.url)),
    live: fileURLToPath(new URL('../../results/demonstration/live.json', import.meta.url)),
} as const;

/** Where each matrix's recordings live, one `<YYYY-MM-DD>/` fixture set per recording day; the newest one counts. */
export const demonstrationFixtureRoots = {
    scripted: fileURLToPath(new URL('../../fixtures/demonstration/scripted/', import.meta.url)),
    live: fileURLToPath(new URL('../../fixtures/demonstration/live/', import.meta.url)),
} as const;

/** Writes a matrix as its committed JSON, formatted by the project's Prettier config. */
export const writeDemonstrationReport = (file: string, report: DemonstrationReport): Promise<void> =>
    writeFormattedFile(file, JSON.stringify(report));
