import { describe, expect, test } from 'vitest';

import { capitalisedFactLabel, factLabel } from './fact-label.ts';

describe('fact labels', () => {
    test('a camelCase JSON key reads as words in plain mode and capitalised in human mode', () => {
        expect(factLabel('spendCap')).toBe('spend cap');
        expect(capitalisedFactLabel('spendCap')).toBe('Spend cap');
        expect(capitalisedFactLabel('stack')).toBe('Stack');
    });
});
