import { stopwords } from './stopwords.ts';

/** Words shorter than this keep a trailing `s`: "bus", "gas" and "its" are not plurals. */
const minPluralLength = 4;

const singular = (word: string): string =>
    word.length >= minPluralLength && word.endsWith('s') && !word.endsWith('ss') ? word.slice(0, -1) : word;

/**
 * The content words of a text: lower-cased, split on anything that is not a letter or digit, stopwords dropped and
 * a trailing plural `s` removed. Case, punctuation, word order and plurals therefore never change the set.
 */
export const terms = (text: string): ReadonlySet<string> =>
    new Set(
        text
            .toLowerCase()
            .split(/[^\p{L}\p{N}]+/u)
            .filter((word) => word.length > 0 && !stopwords.has(word))
            .map(singular),
    );
