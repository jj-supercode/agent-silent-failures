import { describe, expect, test } from 'vitest';

import { leadSentence } from './lead-sentence.ts';

describe('leadSentence', () => {
    test('keeps abbreviations at the start with the sentence they open', () => {
        expect(leadSentence('Prof. Dr. Ulrich Hans Walter (born 1954) is a German physicist. He flew in 1993.')).toBe(
            'Prof. Dr. Ulrich Hans Walter (born 1954) is a German physicist.',
        );
    });

    test('a plain first sentence is returned as it is', () => {
        expect(leadSentence('Treasure Island is a novel. It was published in 1883.')).toBe(
            'Treasure Island is a novel.',
        );
    });

    test('a text without a boundary, or a short one, is returned whole', () => {
        expect(leadSentence('  a fragment without end  ')).toBe('a fragment without end');
        expect(leadSentence('Yes.')).toBe('Yes.');
        expect(leadSentence('')).toBe('');
    });
});
