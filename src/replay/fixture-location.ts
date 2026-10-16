import { access, readdir } from 'node:fs/promises';
import path from 'node:path';

/** Fixture sets live under `fixtures/<mode>/<YYYY-MM-DD>/`; the newest date sorts last. */
const datedDirectoryPattern = /^\d{4}-\d{2}-\d{2}$/;

/** A recording writes its manifest after the first run; a directory without one holds no replayable set yet. */
const holdsManifest = (directory: string): Promise<boolean> =>
    access(path.join(directory, 'manifest.json')).then(
        () => true,
        () => false,
    );

/** The newest `<YYYY-MM-DD>` directory under `parent` that holds a manifest, or `null`. */
export const newestDatedDirectory = async (parent: string): Promise<string | null> => {
    const entries = await readdir(parent, { withFileTypes: true }).catch(() => []);
    const dated = entries
        .filter((entry) => entry.isDirectory() && datedDirectoryPattern.test(entry.name))
        .map((entry) => path.join(parent, entry.name))
        .toSorted()
        .toReversed();
    const withManifest = await Promise.all(dated.map(holdsManifest));
    return dated.find((_, index) => withManifest[index] === true) ?? null;
};

/**
 * The fixture set replay scores by default: the newest live recording with a manifest, or, until one is committed,
 * the newest dry run (whose numbers are labelled scripted). An empty dated directory left by a refused start is skipped.
 */
export const defaultFixtureDirectory = async (fixturesRoot: string): Promise<string | null> =>
    (await newestDatedDirectory(path.join(fixturesRoot, 'live'))) ??
    (await newestDatedDirectory(path.join(fixturesRoot, 'dry-run')));
