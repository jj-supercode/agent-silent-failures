import { unitIntervalSchema, type UnitInterval } from '../trace/model.ts';

/** Shared items over all items. Two empty sets are identical (1), so an empty text never looks novel. */
export const jaccard = <T>(left: ReadonlySet<T>, right: ReadonlySet<T>): UnitInterval => {
    const union = left.union(right);
    return unitIntervalSchema.parse(union.size === 0 ? 1 : left.intersection(right).size / union.size);
};

/** Same items with the same number of repeats, in any order. */
export const sameCounts = (left: readonly string[], right: readonly string[]): boolean => {
    const sortedRight = right.toSorted();
    return left.length === right.length && left.toSorted().every((item, index) => item === sortedRight[index]);
};

export const sameMembers = <T>(left: ReadonlySet<T>, right: ReadonlySet<T>): boolean =>
    left.size === right.size && left.isSubsetOf(right);
