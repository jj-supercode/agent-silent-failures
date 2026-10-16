import { describe, expect, test } from 'vitest';

import { retrievalsAmong } from './count-phrases.ts';

describe('retrievalsAmong', () => {
    test('names a single retrieval as the only one', () => {
        expect(retrievalsAmong(1, 1)).toBe('the only retrieval');
    });

    test('counts a share of several retrievals', () => {
        expect(retrievalsAmong(2, 5)).toBe('2 of 5 retrievals');
    });
});
