import { describe, expect, test } from 'vitest';

import { unitIntervalSchema } from '../../src/trace/model.ts';
import { axisTicks, roundAxisMax, shareToX, tickLabel } from './axis-scale.ts';

const share = (value: number) => unitIntervalSchema.parse(value);
const plot = { left: 100, right: 600 };

describe('axis scale', () => {
    test('the axis ends at the smallest round share holding every upper bound', () => {
        expect(roundAxisMax([share(0.012), share(0.042)])).toBe(0.05);
        expect(roundAxisMax([share(0.116)])).toBe(0.15);
        expect(roundAxisMax([share(0.6)])).toBe(1);
        expect(roundAxisMax([])).toBe(0.05);
    });

    test('ticks split the axis into five whole-percent steps', () => {
        expect(axisTicks(share(0.15)).map(tickLabel)).toEqual(['0%', '3%', '6%', '9%', '12%', '15%']);
        expect(axisTicks(share(1)).map(tickLabel)).toEqual(['0%', '20%', '40%', '60%', '80%', '100%']);
    });

    test('a share maps linearly onto the plot and never past its right end', () => {
        expect(shareToX(0, share(0.1), plot)).toBe(100);
        expect(shareToX(0.05, share(0.1), plot)).toBe(350);
        expect(shareToX(0.4, share(0.1), plot)).toBe(600);
    });
});
