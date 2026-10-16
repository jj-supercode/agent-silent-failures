import { describe, expect, test } from 'vitest';

import { rateOf, rateWhere, ruleOfThreeMinTrials, ruleOfThreeUpper, wilsonInterval } from './rate.ts';

/** Bounds are compared to one decimal of a percent, as reports print them. */
const percentDigits = 3;

describe('wilsonInterval', () => {
    test('58 of 60 gives [88.6%, 99.1%], the report format example', () => {
        const { lower, upper } = wilsonInterval(58, 60);
        expect(lower).toBeCloseTo(0.886, percentDigits);
        expect(upper).toBeCloseTo(0.991, percentDigits);
    });

    test.each([
        [20, 0.839],
        [30, 0.886],
        [60, 0.94],
        [120, 0.969],
    ])('all of %i caught has a Wilson lower bound of %f', (trials, lower) => {
        expect(wilsonInterval(trials, trials).lower).toBeCloseTo(lower, percentDigits);
        expect(wilsonInterval(trials, trials).upper).toBeCloseTo(1, percentDigits);
    });

    test.each([
        [0, 120, 0.031],
        [0, 30, 0.114],
        [1, 60, 0.089],
        [1, 80, 0.067],
    ])('%i false alarms in %i has a Wilson upper bound of %f', (events, trials, upper) => {
        expect(wilsonInterval(events, trials).upper).toBeCloseTo(upper, percentDigits);
    });

    test('zero events give a lower bound of exactly 0 and all events an upper bound of exactly 1', () => {
        expect(rateOf(0, 120).interval?.lower).toBe(0);
        expect(rateOf(36, 36).interval?.upper).toBe(1);
    });

    test('the bounds always enclose the observed share', () => {
        const { lower, upper } = wilsonInterval(7, 13);
        expect(lower).toBeLessThan(7 / 13);
        expect(upper).toBeGreaterThan(7 / 13);
    });
});

describe('ruleOfThreeUpper', () => {
    test('is 3 / n from 30 trials on', () => {
        expect(ruleOfThreeUpper(120)).toBeCloseTo(0.025, percentDigits);
        expect(ruleOfThreeUpper(ruleOfThreeMinTrials)).toBeCloseTo(0.1, percentDigits);
    });

    test('is not reported below 30 trials, where the approximation does not hold', () => {
        expect(ruleOfThreeUpper(2)).toBeNull();
        expect(ruleOfThreeUpper(ruleOfThreeMinTrials - 1)).toBeNull();
    });
});

describe('rateOf', () => {
    test('zero trials have no share and no interval', () => {
        expect(rateOf(0, 0)).toEqual({ events: 0, trials: 0, share: null, interval: null });
    });

    test('zero events add the rule-of-three bound', () => {
        expect(rateOf(0, 60).interval?.ruleOfThreeUpper).toBeCloseTo(0.05, percentDigits);
    });

    test('a non-zero count has no rule-of-three bound', () => {
        expect(rateOf(3, 60).interval?.ruleOfThreeUpper).toBeNull();
        expect(rateOf(3, 60).share).toBeCloseTo(0.05, percentDigits);
    });
});

describe('rateWhere', () => {
    test('counts the items that satisfy the predicate', () => {
        const rate = rateWhere([1, 2, 3, 4], (value) => value % 2 === 0);
        expect([rate.events, rate.trials]).toEqual([2, 4]);
    });
});
