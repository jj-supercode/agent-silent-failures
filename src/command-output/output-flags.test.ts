import { describe, expect, test } from 'vitest';

import { splitOutputFlags } from './output-flags.ts';

describe('splitOutputFlags', () => {
    test('takes the output flags out and leaves the command flags in order', () => {
        expect(splitOutputFlags(['--split', 'dev', '--json', '--entry', 'tool-loop'])).toEqual({
            kind: 'split',
            flags: { mode: 'json', help: false },
            commandArgs: ['--split', 'dev', '--entry', 'tool-loop'],
        });
    });

    test('reads --plain, --help and -h', () => {
        expect(splitOutputFlags(['--plain', '-h'])).toMatchObject({ flags: { mode: 'plain', help: true } });
        expect(splitOutputFlags(['--help'])).toMatchObject({ flags: { mode: null, help: true } });
    });

    test('refuses --json together with --plain', () => {
        expect(splitOutputFlags(['--json', '--plain']).kind).toBe('invalid');
    });

    test('leaves everything after -- to the command', () => {
        expect(splitOutputFlags(['--json', '--', '--plain'])).toMatchObject({
            flags: { mode: 'json' },
            commandArgs: ['--', '--plain'],
        });
    });
});
