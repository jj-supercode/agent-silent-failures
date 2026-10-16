import { describe, expect, test } from 'vitest';

import { isIgnored, parseIgnoreRules } from './ignore-rules.ts';

const rules = parseIgnoreRules(
    [
        '# local state',
        'node_modules/',
        '.env*',
        '!.env.example',
        '*.db-*',
        'results/live/',
        '',
        'fixtures/**/*.tmp',
    ].join('\n'),
);

describe('isIgnored', () => {
    test('a name pattern matches at any depth', () => {
        expect(isIgnored(rules, '.env', false)).toBe(true);
        expect(isIgnored(rules, 'repros/one/.env.local', false)).toBe(true);
        expect(isIgnored(rules, 'data/store.db-wal', false)).toBe(true);
    });

    test('a later negation re-includes the file', () => {
        expect(isIgnored(rules, '.env.example', false)).toBe(false);
    });

    test('a trailing slash names directories only', () => {
        expect(isIgnored(rules, 'node_modules', true)).toBe(true);
        expect(isIgnored(rules, 'node_modules', false)).toBe(false);
    });

    test('a pattern with an inner slash is anchored at the root', () => {
        expect(isIgnored(rules, 'results/live', true)).toBe(true);
        expect(isIgnored(rules, 'docs/results/live', true)).toBe(false);
        expect(isIgnored(rules, 'fixtures/live/2026-10-15/runs.tmp', false)).toBe(true);
    });

    test('comments, blank lines and unmatched paths ignore nothing', () => {
        expect(isIgnored(rules, 'README.md', false)).toBe(false);
        expect(isIgnored(rules, '# local state', false)).toBe(false);
    });
});
