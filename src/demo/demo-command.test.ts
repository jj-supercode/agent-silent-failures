import { describe, expect, test } from 'vitest';

import { demoOptionsFromArgs } from './demo-command.ts';

const smallBatch = 4;

describe('demoOptionsFromArgs', () => {
    test('no flags change no setting and print no details', () => {
        expect(demoOptionsFromArgs([])).toEqual({ settings: {}, details: false });
    });

    test('--embedding-batch-size and --cold set the batch and switch the cache off', () => {
        expect(demoOptionsFromArgs(['--embedding-batch-size', String(smallBatch), '--cold']).settings).toEqual({
            embedding: { batchSize: smallBatch },
            embeddingCache: false,
        });
    });

    test('--details asks for the full tables', () => {
        expect(demoOptionsFromArgs(['--details']).details).toBe(true);
    });

    test('an unknown flag is rejected', () => {
        expect(() => demoOptionsFromArgs(['--bogus'])).toThrow(/bogus/);
    });

    test('a batch size that is not a positive integer is rejected', () => {
        expect(() => demoOptionsFromArgs(['--embedding-batch-size', 'zero'])).toThrow();
    });
});
