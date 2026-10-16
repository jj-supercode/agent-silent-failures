import { describe, expect, test } from 'vitest';

import { inBatches } from './batches.ts';

describe('inBatches', () => {
    test('splits in order, the last batch holding the rest', () => {
        expect(inBatches(['a', 'b', 'c', 'd', 'e'], 2)).toEqual([['a', 'b'], ['c', 'd'], ['e']]);
    });

    test('an empty list gives no batches', () => {
        expect(inBatches([], 8)).toEqual([]);
    });
});
