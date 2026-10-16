import { describe, expect, test } from 'vitest';

import { demonstrationLiveCommand } from './live-command.ts';
import { demonstrationCommand } from './demonstration-command.ts';

describe('demonstration:live options', () => {
    test('no options is a live run to the default file', () => {
        expect(demonstrationLiveCommand.parseOptions([])).toEqual({
            kind: 'parsed',
            options: { mode: 'live', out: null, fixtures: null },
        });
    });

    test('--dry-run, --out and --fixtures are read', () => {
        expect(
            demonstrationLiveCommand.parseOptions(['--dry-run', '--out', '/tmp/matrix.json', '--fixtures', '/tmp/set']),
        ).toEqual({
            kind: 'parsed',
            options: { mode: 'dry-run', out: '/tmp/matrix.json', fixtures: '/tmp/set' },
        });
    });

    test('an unknown option is refused as a value, never thrown', () => {
        expect(demonstrationLiveCommand.parseOptions(['--live'])).toMatchObject({ kind: 'invalid' });
    });
});

describe('demonstration options', () => {
    test('the scripted matrix rehearses by default, and writes or re-scores only when asked', () => {
        expect(demonstrationCommand.parseOptions([])).toEqual({ kind: 'parsed', options: { action: 'rehearse' } });
        expect(demonstrationCommand.parseOptions(['--write'])).toEqual({
            kind: 'parsed',
            options: { action: 'write' },
        });
        expect(demonstrationCommand.parseOptions(['--rescore'])).toEqual({
            kind: 'parsed',
            options: { action: 'rescore' },
        });
        expect(demonstrationCommand.parseOptions(['--write', '--rescore'])).toMatchObject({ kind: 'invalid' });
        expect(demonstrationCommand.parseOptions(['--dry-run'])).toMatchObject({ kind: 'invalid' });
    });
});
