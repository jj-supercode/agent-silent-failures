import { describe, expect, test } from 'vitest';

import { excerpt } from './text-excerpt.ts';

describe('excerpt', () => {
    test('keeps text that fits', () => {
        expect(excerpt('fired, severity 1.00', 20)).toBe('fired, severity 1.00');
    });

    test('cuts at the last whole word, drops trailing punctuation, and marks the cut', () => {
        expect(excerpt('58 of 77 chunks exceed the window (longest 938 tokens)', 40)).toBe(
            '58 of 77 chunks exceed the window...',
        );
    });

    test('never exceeds the limit, even for one long word', () => {
        expect(excerpt('a'.repeat(30), 10)).toBe('aaaaaaa...');
    });
});
