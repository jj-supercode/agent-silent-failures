/** `items` in consecutive batches of at most `batchSize`, in order; an empty list gives no batches. */
export const inBatches = <T>(items: readonly T[], batchSize: number): readonly (readonly T[])[] =>
    Array.from({ length: Math.ceil(items.length / batchSize) }, (_, index) =>
        items.slice(index * batchSize, (index + 1) * batchSize),
    );
