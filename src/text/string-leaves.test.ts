import { describe, expect, test } from 'vitest';

import { stringLeaves } from './string-leaves.ts';

describe('stringLeaves', () => {
    test('collects strings from nested objects and arrays, skipping keys and other values', () => {
        expect(stringLeaves({ hits: [{ text: 'Ed Wood', score: 0.9 }, { text: 'Denver' }], ok: true })).toEqual([
            'Ed Wood',
            'Denver',
        ]);
    });

    test('a plain string is its own leaf; null has none', () => {
        expect([stringLeaves('alone'), stringLeaves(null)]).toEqual([['alone'], []]);
    });
});
