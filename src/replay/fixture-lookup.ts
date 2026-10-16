import { displayPath } from '../command-output/index.ts';
import { readFixtureSet, type FixtureSet } from '../record/index.ts';
import { defaultFixtureDirectory } from './fixture-location.ts';
import { fixturesRoot, repositoryRoot } from './repository-paths.ts';

export type FixtureLookup =
    | { readonly kind: 'found'; readonly fixtures: FixtureSet }
    | { readonly kind: 'missing'; readonly why: string; readonly fix: string };

/** The fixture set asked for, or the newest committed one; what is missing and how to fix it otherwise. */
export const findFixtureSet = async (requested: string | null): Promise<FixtureLookup> => {
    const directory = requested ?? (await defaultFixtureDirectory(fixturesRoot));
    if (directory === null) {
        return {
            kind: 'missing',
            why: 'there is no fixture set under fixtures/live/ or fixtures/dry-run/',
            fix: 'record one with pnpm demo:live --dry-run (free) or pnpm demo:live (your key)',
        };
    }
    const read = await readFixtureSet(directory);
    return read.kind === 'read'
        ? { kind: 'found', fixtures: read.fixtures }
        : {
              kind: 'missing',
              why: `${displayPath(repositoryRoot, read.directory)}: ${read.reason}`,
              fix: 'name a fixture set written by pnpm demo:live with --fixtures <dir>',
          };
};
