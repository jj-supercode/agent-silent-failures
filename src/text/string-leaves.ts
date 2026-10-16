/** Every string inside a JSON-like value (object values and array items, at any depth), in traversal order. */
export const stringLeaves = (value: unknown): readonly string[] => {
    if (typeof value === 'string') {
        return [value];
    }
    if (Array.isArray(value)) {
        return value.flatMap(stringLeaves);
    }
    return typeof value === 'object' && value !== null ? Object.values(value).flatMap(stringLeaves) : [];
};
