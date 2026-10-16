import { readdir } from 'node:fs/promises';

import { describe, expect, test } from 'vitest';

import { catalog, catalogEntries, cleanPool } from './index.ts';

const entryFolders = (await readdir(new URL('../entries/', import.meta.url), { withFileTypes: true }))
    .filter((dirent) => dirent.isDirectory())
    .map((dirent) => dirent.name);

describe('catalog', () => {
    test('holds every entry folder exactly once', () => {
        const ids = catalogEntries.map((entry) => entry.id);
        expect(new Set(ids).size).toBe(ids.length);
        expect(ids.toSorted()).toEqual(entryFolders.toSorted());
    });

    test.each(catalog.map((item) => [item.entry.id, item] as const))(
        '%s sweeps each named threshold over a range that includes its own value',
        (_, item) => {
            const swept = new Map(item.sweeps.map((sweep) => [sweep.threshold, sweep.values]));
            expect([...swept.keys()].toSorted()).toEqual(Object.keys(item.entry.thresholds).toSorted());
            Object.entries(item.entry.thresholds).forEach(([name, threshold]) =>
                expect(swept.get(name)).toContain(threshold.value),
            );
        },
    );

    test.each(catalog.map((item) => [item.entry.id, item] as const))(
        '%s fault cases belong to it and have unique severities',
        (id, item) => {
            expect(item.faultCases.every((faultCase) => faultCase.entryId === id)).toBe(true);
            const labels = item.faultCases.map((faultCase) => `${faultCase.faultId}/${faultCase.severity}`);
            expect(new Set(labels).size).toBe(labels.length);
        },
    );

    test('multi-agent entries are reproduced on the multi-agent harness only', () => {
        const multiAgent = catalog.filter((item) => item.entry.family === 'multi-agent');
        expect(
            multiAgent
                .flatMap((item) => item.faultCases)
                .every((faultCase) => faultCase.setting.harness === 'multi-agent'),
        ).toBe(true);
    });

    test('only faults that can be no-ops are checked for expression; all of them read the ingestion report', () => {
        const checked = catalog
            .flatMap((item) => item.faultCases)
            .filter((faultCase) => faultCase.expression.kind === 'ingestion')
            .map((faultCase) => faultCase.faultId);
        expect(new Set(checked)).toEqual(new Set(['default-chunk-size', 'embed-batch-cap', 'zero-vectors']));
    });

    test('fault ids never collide with each other across entries', () => {
        const owners = new Map(
            catalog.flatMap((item) => item.faultCases.map((faultCase) => [faultCase.faultId, item.entry.id])),
        );
        const pairs = new Set(
            catalog.flatMap((item) => item.faultCases.map((faultCase) => `${faultCase.faultId}:${item.entry.id}`)),
        );
        expect(pairs.size).toBe(owners.size);
    });
});

describe('cleanPool', () => {
    test('variation ids are unique and hard negatives name catalog entries', () => {
        const ids = cleanPool.map((variation) => variation.id);
        const entryIds = new Set(catalogEntries.map((entry) => entry.id));
        expect(new Set(ids).size).toBe(ids.length);
        expect(cleanPool.flatMap((variation) => variation.hardNegativeFor).every((id) => entryIds.has(id))).toBe(true);
    });

    test('every entry has at least one hard negative in the pool', () => {
        const tempted = new Set(cleanPool.flatMap((variation) => variation.hardNegativeFor));
        expect(catalogEntries.filter((entry) => !tempted.has(entry.id)).map((entry) => entry.id)).toEqual([]);
    });
});
