import { describe, expect, test } from 'vitest';

import { familiesBySplit } from './families.ts';
import { seedFor } from './seeds.ts';

const sample = 'Who wrote the novel Treasure Island?';

describe('familiesBySplit', () => {
    const dev = familiesBySplit.dev;
    const heldOut = familiesBySplit['held-out'];

    test('held-out families use phrasings and wordings no dev family uses', () => {
        const devPhrasings = new Set(dev.map((family) => family.phrasing.name));
        const devWordings = new Set(dev.map((family) => family.wording.name));
        expect(heldOut.filter((family) => devPhrasings.has(family.phrasing.name))).toEqual([]);
        expect(heldOut.filter((family) => devWordings.has(family.wording.name))).toEqual([]);
    });

    test('held-out families abstain, delegate and answer as supervisors in words no dev family uses', () => {
        const disjoint = (name: (family: (typeof heldOut)[number]) => string) => {
            const devNames = new Set(dev.map(name));
            return heldOut.filter((family) => devNames.has(name(family)));
        };
        expect(disjoint((family) => family.abstention.sentence)).toEqual([]);
        expect(disjoint((family) => family.delegation.name)).toEqual([]);
        expect(disjoint((family) => family.supervisorAnswer.name)).toEqual([]);
    });

    test('a delegation phrasing applied to a re-sent request does not grow it again', () => {
        [...dev, ...heldOut].forEach((family) => {
            const once = family.delegation.rephrase('Research Treasure Island.');
            expect(family.delegation.rephrase(once)).toBe(once);
        });
    });

    test('held-out families add top K values and chunk sizes dev never sees', () => {
        const devTopKs = new Set(dev.map((family) => family.topK));
        const devChunkSizes = new Set(dev.map((family) => family.chunking.maxSize));
        expect(heldOut.some((family) => !devTopKs.has(family.topK))).toBe(true);
        expect(heldOut.some((family) => !devChunkSizes.has(family.chunking.maxSize))).toBe(true);
    });

    test('every phrasing keeps the question searchable', () => {
        [...dev, ...heldOut].forEach((family) => expect(family.phrasing.rephrase(sample)).toMatch(/treasure island/i));
    });
});

describe('seedFor', () => {
    test('is a stable unsigned 32-bit integer of its labels', () => {
        const seed = seedFor(['held-out', 'h1', 'q1', 0]);
        expect(seed).toBe(seedFor(['held-out', 'h1', 'q1', 0]));
        expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true);
        expect(seedFor(['held-out', 'h1', 'q1', 1])).not.toBe(seed);
    });
});
