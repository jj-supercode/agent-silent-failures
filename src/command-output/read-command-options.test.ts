import { parseArgs } from 'node:util';

import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import { readCommandOptions } from './read-command-options.ts';

describe('readCommandOptions', () => {
    test('returns what the parser returns', () => {
        expect(readCommandOptions(() => 'parsed value')).toEqual({ kind: 'parsed', options: 'parsed value' });
    });

    test('an unknown flag becomes a reason, not a thrown error', () => {
        const read = readCommandOptions(() => parseArgs({ args: ['--bogus'], strict: true, options: {} }));
        expect(read.kind).toBe('invalid');
        expect(read.kind === 'invalid' ? read.reason : '').toContain('--bogus');
    });

    test('a schema failure is printed readably', () => {
        const read = readCommandOptions(() => z.object({ split: z.enum(['dev']) }).parse({ split: 'nope' }));
        expect(read.kind === 'invalid' ? read.reason : '').toContain('split');
    });
});
