import path from 'node:path';

/** One line of a `.gitignore`. */
export type IgnoreRule = {
    readonly glob: string;
    readonly negated: boolean;
    /** A trailing `/`: the rule names directories only. */
    readonly directoryOnly: boolean;
    /** A `/` before the end: the glob matches the path from the root; otherwise it matches a name at any depth. */
    readonly anchored: boolean;
};

const toRule = (line: string): IgnoreRule => {
    const negated = line.startsWith('!');
    const body = negated ? line.slice(1) : line;
    const directoryOnly = body.endsWith('/');
    const glob = directoryOnly ? body.slice(0, -1) : body;
    return { glob: glob.replace(/^\//, ''), negated, directoryOnly, anchored: glob.includes('/') };
};

/**
 * Parses the subset of gitignore syntax this repository uses: comments, blank lines, `!` negation, a trailing `/`
 * for directories, anchoring by an inner or leading `/`, and `*`, `?` and `**` globs. Escapes (`\#`, `\!`) and
 * trailing-space escapes are not supported.
 */
export const parseIgnoreRules = (gitignore: string): readonly IgnoreRule[] =>
    gitignore
        .split('\n')
        .map((line) => line.trimEnd())
        .filter((line) => line !== '' && !line.startsWith('#'))
        .map(toRule);

const ruleMatches = (rule: IgnoreRule, relativePath: string, isDirectory: boolean): boolean =>
    (isDirectory || !rule.directoryOnly) &&
    path.posix.matchesGlob(rule.anchored ? relativePath : path.posix.basename(relativePath), rule.glob);

/**
 * Whether git ignores `relativePath` (POSIX separators, relative to the repository root) by these rules alone: the
 * last matching rule decides. The caller does not descend into an ignored directory, as git does not.
 */
export const isIgnored = (rules: readonly IgnoreRule[], relativePath: string, isDirectory: boolean): boolean =>
    rules.findLast((rule) => ruleMatches(rule, relativePath, isDirectory))?.negated === false;
