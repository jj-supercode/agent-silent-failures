/**
 * Greedy clustering in input order: an item joins the first cluster whose first item it matches, else starts one.
 * Deterministic and order-sensitive by design: the first occurrence is the reference a repeat is compared with.
 */
export const clusterBy = <T>(
    items: readonly T[],
    matches: (reference: T, item: T) => boolean,
): readonly (readonly T[])[] =>
    items.reduce<readonly (readonly T[])[]>((clusters, item) => {
        const home = clusters.findIndex(([reference]) => reference !== undefined && matches(reference, item));
        return home === -1
            ? [...clusters, [item]]
            : clusters.map((cluster, index) => (index === home ? [...cluster, item] : cluster));
    }, []);

export const largestCluster = <T>(clusters: readonly (readonly T[])[]): readonly T[] =>
    clusters.reduce<readonly T[]>((largest, cluster) => (cluster.length > largest.length ? cluster : largest), []);

/** What makes a sequence alternate: each item differs from the one before it and repeats the one two back. */
export type AlternationRule<T> = {
    readonly differs: (previous: T, item: T) => boolean;
    readonly repeats: (twoBack: T, item: T) => boolean;
};

/** Length of the alternating stretch (A, B, A, B, ...) that ends at each item. */
const alternationLengths = <T>(items: readonly T[], rule: AlternationRule<T>): readonly number[] =>
    items.reduce<readonly number[]>((lengths, item, index) => {
        const previous = items[index - 1];
        const twoBack = items[index - 2];
        const differs = previous !== undefined && rule.differs(previous, item);
        const repeats = twoBack !== undefined && rule.repeats(twoBack, item);
        return [...lengths, differs ? (repeats ? (lengths.at(-1) ?? 1) + 1 : 2) : 1];
    }, []);

/** The longest alternating stretch (the first on ties); a single item for a non-empty sequence that never alternates. */
export const longestAlternation = <T>(items: readonly T[], rule: AlternationRule<T>): readonly T[] => {
    const lengths = alternationLengths(items, rule);
    const end = lengths.reduce((best, length, index) => (length > (lengths[best] ?? 0) ? index : best), 0);
    return items.slice(end + 1 - (lengths[end] ?? 0), end + 1);
};
