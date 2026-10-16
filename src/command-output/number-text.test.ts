import { describe, expect, test } from 'vitest';

import { countedText, countText, durationText, mebibytesText, percentText, usdText } from './number-text.ts';

const second = 1_000;
const minute = 60 * second;
const hour = 60 * minute;
const mebibyte = 1024 * 1024;

describe('number text', () => {
    test('durations keep a decimal under ten seconds and switch units above a minute and an hour', () => {
        expect(durationText(3.44 * second)).toBe('3.4 s');
        expect(durationText(12.4 * second)).toBe('12 s');
        expect(durationText(4 * minute + 5 * second)).toBe('4m 05s');
        expect(durationText(hour + 12 * minute)).toBe('1h 12m');
        expect(durationText(-second)).toBe('0.0 s');
    });

    test('money rounds to cents and keeps four decimals under a cent', () => {
        expect(usdText(0.3617)).toBe('USD 0.36');
        expect(usdText(0.0045)).toBe('USD 0.0045');
        expect(usdText(0)).toBe('USD 0');
    });

    test('counts are grouped, shares are percentages, memory is in MiB', () => {
        expect(countText(2776)).toBe('2,776');
        expect(countedText(1, 'run')).toBe('1 run');
        expect(countedText(2776, 'run')).toBe('2,776 runs');
        expect(percentText(0.9667)).toBe('96.7%');
        expect(mebibytesText(556.4 * mebibyte)).toBe('556 MiB');
    });
});
