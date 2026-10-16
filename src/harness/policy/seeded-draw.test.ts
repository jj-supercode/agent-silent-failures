import { describe, expect, test } from 'vitest';

import { unitIntervalSchema } from '../../trace/index.ts';
import { createDraw, pickWithDraw } from './seeded-draw.ts';

const seed = 7;
const scope = ['question-1', 0];

describe('createDraw', () => {
    test('the same seed, scope and label always draw the same value', () => {
        expect(createDraw(seed, scope)('phrasing')).toBe(createDraw(seed, scope)('phrasing'));
    });

    test('draws stay in [0, 1)', () => {
        const draws = Array.from({ length: 100 }, (_, label) => createDraw(seed, scope)(`label-${label}`));
        expect(draws.every((draw) => draw >= 0 && draw < 1)).toBe(true);
    });

    test('a different label or seed draws independently', () => {
        const draw = createDraw(seed, scope);
        expect(draw('a')).not.toBe(draw('b'));
        expect(createDraw(seed + 1, scope)('a')).not.toBe(draw('a'));
    });
});

describe('pickWithDraw', () => {
    test('maps the unit interval evenly onto the options', () => {
        const options = ['first', 'second'] as const;
        expect([0, 0.49, 0.5, 0.999].map((draw) => pickWithDraw(options, unitIntervalSchema.parse(draw)))).toEqual([
            'first',
            'first',
            'second',
            'second',
        ]);
    });
});
