import { describe, expect, test } from 'vitest';

import { selectSubsample } from './select-subsample.ts';
import type { HotpotSourceRow } from './source-row.ts';

const sampleRow = (id: string, type: HotpotSourceRow['type'], goldTitles: readonly string[]): HotpotSourceRow => ({
    id,
    question: `question ${id}`,
    answer: 'answer',
    type,
    level: 'medium',
    supporting_facts: { title: [...goldTitles], sent_id: goldTitles.map(() => 0) },
    context: { title: [...goldTitles], sentences: goldTitles.map((title) => [`${title}.`]) },
});

const rows = [
    sampleRow('b1', 'bridge', ['A', 'B']),
    sampleRow('b2', 'bridge', ['B', 'C']),
    sampleRow('b3', 'bridge', ['D', 'E']),
    sampleRow('c1', 'comparison', ['F', 'G']),
    sampleRow('c2', 'comparison', ['H', 'I']),
];
const spec = { seed: 'test-seed', perType: { bridge: 2, comparison: 1 } };

describe('selectSubsample', () => {
    test('takes the requested number of rows per type', () => {
        const picked = selectSubsample(rows, spec);
        expect(picked.filter((row) => row.type === 'bridge')).toHaveLength(spec.perType.bridge);
        expect(picked.filter((row) => row.type === 'comparison')).toHaveLength(spec.perType.comparison);
    });

    test('never picks two rows that share a gold title', () => {
        const titles = selectSubsample(rows, spec).flatMap((row) => row.supporting_facts.title);
        expect(new Set(titles).size).toBe(titles.length);
    });

    test('does not depend on input order', () => {
        expect(selectSubsample(rows.toReversed(), spec).map((row) => row.id)).toEqual(
            selectSubsample(rows, spec).map((row) => row.id),
        );
    });

    test('a different seed gives a different ranking', () => {
        const seeds = ['seed-a', 'seed-b', 'seed-c', 'seed-d'];
        const firstPicks = new Set(
            seeds.map((seed) => selectSubsample(rows, { seed, perType: { bridge: 1, comparison: 0 } })[0]?.id),
        );
        expect(firstPicks.size).toBeGreaterThan(1);
    });
});
