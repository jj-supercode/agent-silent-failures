import { describe, expect, test } from 'vitest';

import { wrapWords } from './wrap-words.ts';

describe('wrapWords', () => {
    test('keeps every line within the budget, breaking at spaces', () => {
        expect(wrapWords('one two three four', 9)).toEqual(['one two', 'three', 'four']);
    });

    test('gives a word longer than the budget a line of its own', () => {
        expect(wrapWords('a results/replay/report.json b', 10)).toEqual(['a', 'results/replay/report.json', 'b']);
    });

    test('ignores repeated spaces and returns no lines for empty text', () => {
        expect(wrapWords('a  b', 10)).toEqual(['a b']);
        expect(wrapWords('', 10)).toEqual([]);
    });
});
