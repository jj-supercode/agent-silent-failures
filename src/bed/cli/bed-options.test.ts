import { describe, expect, test } from 'vitest';

import { bedOptionsFromArgs } from './bed-options.ts';

const smallBatch = 4;

describe('bedOptionsFromArgs', () => {
    test('defaults: both splits, every entry, nothing written', () => {
        expect(bedOptionsFromArgs([])).toEqual({
            split: 'all',
            entryId: null,
            writeResults: false,
            reportJsonPath: null,
            details: false,
            settings: {},
        });
    });

    test('reads the entry filter, the report path and the embedding batch', () => {
        const options = bedOptionsFromArgs([
            '--split',
            'held-out',
            '--entry',
            'tool-loop',
            '--report-json',
            'out.json',
            '--embedding-batch-size',
            String(smallBatch),
        ]);
        expect(options).toMatchObject({ split: 'held-out', entryId: 'tool-loop', reportJsonPath: 'out.json' });
        expect(options.settings).toEqual({ embedding: { batchSize: smallBatch } });
    });

    test('rejects an unknown entry', () => {
        expect(() => bedOptionsFromArgs(['--entry', 'no-such-entry'])).toThrow();
    });

    test('--write-results needs the full catalog over both splits', () => {
        expect(() => bedOptionsFromArgs(['--write-results', '--entry', 'tool-loop'])).toThrow();
        expect(() => bedOptionsFromArgs(['--write-results', '--split', 'held-out'])).toThrow();
        expect(bedOptionsFromArgs(['--write-results']).writeResults).toBe(true);
    });

    test('--json is an output mode, not a report path: the command line reaches the parser without it', () => {
        expect(() => bedOptionsFromArgs(['--json', 'out.json'])).toThrow(/json/);
    });

    test('the removed --write-docs is an unknown flag: entry pages come from pnpm docs:tables', () => {
        expect(() => bedOptionsFromArgs(['--write-docs'])).toThrow(/write-docs/);
    });
});
