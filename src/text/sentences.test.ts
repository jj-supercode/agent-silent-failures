import { describe, expect, test } from 'vitest';

import { firstSentence, sentences } from './sentences.ts';

describe('sentences', () => {
    test('splits after sentence punctuation and drops empty pieces', () => {
        expect(sentences(' One. Two!  Three? ')).toEqual(['One.', 'Two!', 'Three?']);
    });

    test('a text without a boundary is one sentence', () => {
        expect(firstSentence('  no boundary here ')).toBe('no boundary here');
    });

    test('an empty text has no sentences', () => {
        expect(sentences('')).toEqual([]);
    });
});
