import { describe, expect, test } from 'vitest';

import { duplicateCosineTolerance, summarizeVectors } from './vector-stats.ts';

const unit = [1, 0, 0];
const other = [0, 1, 0];
const zero = [0, 0, 0];

describe('summarizeVectors', () => {
    test('a healthy set has no zero, non-finite or duplicate vectors', () => {
        expect(
            summarizeVectors([
                { text: 'a', vector: unit },
                { text: 'b', vector: other },
            ]),
        ).toEqual({
            zeroNormCount: 0,
            nonFiniteCount: 0,
            duplicateOfDistinctTextCount: 0,
        });
    });

    test('counts zero-norm and non-finite vectors separately', () => {
        const stats = summarizeVectors([
            { text: 'a', vector: zero },
            { text: 'b', vector: [Number.NaN, 0, 0] },
        ]);
        expect(stats).toMatchObject({ zeroNormCount: 1, nonFiniteCount: 1 });
    });

    test('counts a repeated vector for different text as a duplicate (what a lost tail looks like)', () => {
        const scaled = unit.map((component) => component * 2);
        expect(
            summarizeVectors([
                { text: 'a', vector: unit },
                { text: 'a plus a tail', vector: scaled },
            ]).duplicateOfDistinctTextCount,
        ).toBe(1);
    });

    test('the same text embedded twice is not a duplicate of distinct text', () => {
        expect(
            summarizeVectors([
                { text: 'a', vector: unit },
                { text: 'a', vector: unit },
            ]).duplicateOfDistinctTextCount,
        ).toBe(0);
    });
});

describe('summarizeVectors duplicate scan', () => {
    const dimension = 8;
    const sampleSize = 300;
    /** Every k-th vector repeats an earlier one: exactly, scaled, or nudged within float32 noise. */
    const repeatEvery = 7;
    const float32Nudge = 1e-9;

    /** A deterministic spread of directions, so the test needs no random source. */
    const direction = (seed: number): readonly number[] =>
        Array.from({ length: dimension }, (_, axis) => (Math.sin(seed * 12.9898 + axis * 78.233) * 43758.5453) % 1);

    const sample: readonly { text: string; vector: readonly number[] }[] = Array.from(
        { length: sampleSize },
        (_, index) => {
            const source = Math.floor(index / 2);
            return index % repeatEvery === 0 && index > 0
                ? { text: `chunk ${index}`, vector: direction(source).map((component) => component * 3 + float32Nudge) }
                : { text: `chunk ${index}`, vector: direction(index) };
        },
    );

    /** The definition, compared against every earlier vector: the reference the fast scan must equal. */
    const pairwiseCount = (embedded: typeof sample): number => {
        const units = embedded.map(({ text, vector }) => {
            const length = Math.hypot(...vector);
            return { text, unit: vector.map((component) => component / length) };
        });
        return units.filter((current, index) =>
            units.slice(0, index).some((earlier) => {
                const cosine = earlier.unit.reduce(
                    (sum, component, axis) => sum + component * (current.unit[axis] ?? 0),
                    0,
                );
                return earlier.text !== current.text && 1 - cosine <= duplicateCosineTolerance;
            }),
        ).length;
    };

    test('counts exactly what the pairwise definition counts', () => {
        const expected = pairwiseCount(sample);
        expect(expected).toBeGreaterThan(0);
        expect(summarizeVectors(sample).duplicateOfDistinctTextCount).toBe(expected);
    });

    test('stays exact when most vectors crowd into a few grid cells', () => {
        const chainLength = 200;
        /** bge-small-en-v1.5's dimension: crowding only stresses the grid at embedding scale. */
        const embeddingDimension = 384;
        /** Neighbours this far apart in phase sit within the tolerance; vectors a few steps apart do not. */
        const phaseStep = 1e-3;
        const crowded = Array.from({ length: chainLength }, (_, index) => ({
            text: `chunk ${index}`,
            vector: Array.from({ length: embeddingDimension }, (_, axis) =>
                Math.sin(index * phaseStep + axis * 78.233),
            ),
        }));
        const expected = pairwiseCount(crowded);
        expect(expected).toBeGreaterThan(chainLength / 2);
        expect(summarizeVectors(crowded).duplicateOfDistinctTextCount).toBe(expected);
    });
});
