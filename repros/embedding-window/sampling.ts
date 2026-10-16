/** Picks `limit` items spread evenly over `items`, so a capped sample still covers the whole corpus. */
export const evenlySpacedSample = <T>(items: readonly T[], limit: number): readonly T[] =>
    items.length <= limit
        ? items
        : Array.from({ length: limit }, (_, index) => items[Math.floor((index * items.length) / limit)]).filter(
              (item): item is T => item !== undefined,
          );
