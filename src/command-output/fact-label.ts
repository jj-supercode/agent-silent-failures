/** A fact's camelCase name as words for a reader: `spendCap` -> `spend cap`. The name itself is the JSON key. */
export const factLabel = (name: string): string => name.replaceAll(/(?<=[a-z0-9])([A-Z])/g, ' $1').toLowerCase();

/** `spendCap` -> `Spend cap`, the label of an aligned row in the human mode. */
export const capitalisedFactLabel = (name: string): string => {
    const label = factLabel(name);
    return `${label.charAt(0).toUpperCase()}${label.slice(1)}`;
};
