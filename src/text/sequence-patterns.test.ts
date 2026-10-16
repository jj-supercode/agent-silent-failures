import { describe, expect, test } from 'vitest';

import { clusterBy, largestCluster, longestAlternation, type AlternationRule } from './sequence-patterns.ts';

describe('clusterBy', () => {
    const sameTens = (reference: number, item: number) => Math.floor(reference / 10) === Math.floor(item / 10);

    test('groups items with the first item of a cluster, keeping input order', () => {
        expect(clusterBy([11, 25, 12, 29, 13], sameTens)).toEqual([
            [11, 12, 13],
            [25, 29],
        ]);
    });

    test('the largest cluster wins, the first on ties', () => {
        expect(largestCluster(clusterBy([11, 25, 12, 29], sameTens))).toEqual([11, 12]);
    });

    test('no items, no clusters', () => {
        expect(largestCluster(clusterBy([], sameTens))).toEqual([]);
    });
});

describe('longestAlternation', () => {
    const sameLetter: AlternationRule<string> = {
        differs: (previous, item) => previous !== item,
        repeats: (twoBack, item) => twoBack === item,
    };

    test('finds A-B-A-B anywhere in the sequence', () => {
        expect(longestAlternation(['x', 'a', 'b', 'a', 'b', 'y', 'y'], sameLetter)).toEqual(['a', 'b', 'a', 'b']);
    });

    test('a run of one repeated item does not alternate', () => {
        expect(longestAlternation(['a', 'a', 'a'], sameLetter)).toEqual(['a']);
    });

    test('an empty sequence has no alternation', () => {
        expect(longestAlternation([], sameLetter)).toEqual([]);
    });
});
