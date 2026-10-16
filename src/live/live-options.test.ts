import { describe, expect, test } from 'vitest';

import { defaultMaxUsd, parseLiveOptions } from './live-options.ts';

describe('parseLiveOptions', () => {
    test('defaults to a live run of the whole plan under the default cap, without the judge', () => {
        expect(parseLiveOptions([])).toEqual({
            kind: 'parsed',
            options: {
                mode: 'live',
                maxUsd: defaultMaxUsd,
                judge: false,
                recording: { kind: 'new', maxRuns: null, outputDirectory: null },
            },
        });
    });

    test('reads every flag', () => {
        expect(
            parseLiveOptions(['--dry-run', '--max-usd', '2.5', '--max-runs', '12', '--judge', '--out', 'tmp/fixtures']),
        ).toEqual({
            kind: 'parsed',
            options: {
                mode: 'dry-run',
                maxUsd: 2.5,
                judge: true,
                recording: { kind: 'new', maxRuns: 12, outputDirectory: 'tmp/fixtures' },
            },
        });
    });

    test('reads a resume of an existing recording', () => {
        expect(parseLiveOptions(['--resume', 'fixtures/live/2026-10-15', '--max-usd', '3'])).toEqual({
            kind: 'parsed',
            options: {
                mode: 'live',
                maxUsd: 3,
                judge: false,
                recording: { kind: 'resume', directory: 'fixtures/live/2026-10-15' },
            },
        });
    });

    test('refuses a resume that also names another directory or a shorter plan', () => {
        expect(parseLiveOptions(['--resume', 'a', '--out', 'b']).kind).toBe('invalid');
        expect(parseLiveOptions(['--resume', 'a', '--max-runs', '4']).kind).toBe('invalid');
    });

    test('refuses a resume without a directory', () => {
        expect(parseLiveOptions(['--resume']).kind).toBe('invalid');
    });

    test('refuses a mistyped flag instead of starting a paid run', () => {
        expect(parseLiveOptions(['--dryrun']).kind).toBe('invalid');
    });

    test('refuses a cap that is not a positive amount', () => {
        expect(parseLiveOptions(['--max-usd', '0']).kind).toBe('invalid');
        expect(parseLiveOptions(['--max-usd', 'ten']).kind).toBe('invalid');
    });

    test('refuses a run limit that is not a positive whole number', () => {
        expect(parseLiveOptions(['--max-runs', '1.5']).kind).toBe('invalid');
    });
});
