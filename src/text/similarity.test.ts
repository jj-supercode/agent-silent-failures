import { describe, expect, test } from 'vitest';

import { jaccard, sameCounts, sameMembers } from './similarity.ts';
import { terms } from './terms.ts';

describe('jaccard', () => {
    test('one added content word at four words scores 0.8', () => {
        expect(jaccard(terms('Ed Wood birth year'), terms('Ed Wood birth year film'))).toBe(0.8);
    });

    test('one substituted content word at four words scores 0.6', () => {
        expect(jaccard(terms('Ed Wood birth year'), terms('Ed Wood death year'))).toBe(0.6);
    });

    test('two empty sets are identical', () => {
        expect(jaccard(new Set(), new Set())).toBe(1);
    });

    test('disjoint sets score 0', () => {
        expect(jaccard(new Set(['a']), new Set(['b']))).toBe(0);
    });
});

describe('sameMembers', () => {
    test('is order independent', () => {
        expect(sameMembers(new Set([1, 2]), new Set([2, 1]))).toBe(true);
    });

    test('a subset is not the same set', () => {
        expect(sameMembers(new Set([1]), new Set([1, 2]))).toBe(false);
    });
});

describe('sameCounts', () => {
    test('is order independent', () => {
        expect(sameCounts(['a', 'b', 'a'], ['a', 'a', 'b'])).toBe(true);
    });

    test('the same members repeated differently are not the same', () => {
        expect(sameCounts(['a', 'a', 'b'], ['a', 'b', 'b'])).toBe(false);
    });
});
