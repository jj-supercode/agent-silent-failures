import { describe, expect, test } from 'vitest';

import { rateSchema } from '../../src/bed/index.ts';
import { countText, percentText } from '../../src/command-output/index.ts';
import { catchText, proportionText, rateCell } from './number-text.ts';

describe('number text', () => {
    test('percent keeps one decimal', () => {
        expect(percentText(0.3577)).toBe('35.8%');
    });

    test('count groups thousands', () => {
        expect(countText(949181)).toBe('949,181');
    });

    test('a repro proportion reads as rate, interval and sample size', () => {
        expect(proportionText({ successes: 37, trials: 120, rate: 0.3083, low: 0.2327, high: 0.3958 })).toBe(
            '30.8% (95% CI 23.3% to 39.6%, n = 120)',
        );
    });

    test('a bed rate reads as events over trials with its interval', () => {
        const allCaught = rateSchema.parse({
            events: 36,
            trials: 36,
            share: 1,
            interval: { lower: 0.9036, upper: 1, ruleOfThreeUpper: null },
        });

        expect(rateCell(allCaught)).toBe('36/36, 100.0% (90.4% to 100.0%)');
    });

    test('a rate without trials says so instead of printing 0%', () => {
        expect(rateCell(rateSchema.parse({ events: 0, trials: 0, share: null, interval: null }))).toBe('no runs');
    });

    test('a catch where every run expressed the fault reads as the plain rate', () => {
        const caught = rateSchema.parse({
            events: 4,
            trials: 4,
            share: 1,
            interval: { lower: 0.51, upper: 1, ruleOfThreeUpper: null },
        });

        expect(catchText({ caught, caughtWhenExpressed: caught, notExpressed: 0, firedWhenNotExpressed: 0 })).toBe(
            '4/4, 100.0% (51.0% to 100.0%)',
        );
    });

    test('a catch with runs that did not express the fault names them and the rate over the rest', () => {
        const caught = rateSchema.parse({
            events: 3,
            trials: 4,
            share: 0.75,
            interval: { lower: 0.3, upper: 0.95, ruleOfThreeUpper: null },
        });
        const caughtWhenExpressed = rateSchema.parse({
            events: 3,
            trials: 3,
            share: 1,
            interval: { lower: 0.44, upper: 1, ruleOfThreeUpper: null },
        });

        expect(catchText({ caught, caughtWhenExpressed, notExpressed: 1, firedWhenNotExpressed: 0 })).toBe(
            '3/4, 75.0% (30.0% to 95.0%); not expressed: 1; caught when expressed 3/3, 100.0% (44.0% to 100.0%)',
        );
    });
});
