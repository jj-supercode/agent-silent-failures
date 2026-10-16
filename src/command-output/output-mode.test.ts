import { describe, expect, test } from 'vitest';

import { outputModeVariable, resolveOutputMode, type OutputModeRequest } from './output-mode.ts';

const terminal: OutputModeRequest = { flag: null, environment: {}, stdoutIsTerminal: true, stderrIsTerminal: true };
const pipe: OutputModeRequest = { flag: null, environment: {}, stdoutIsTerminal: false, stderrIsTerminal: false };

describe('resolveOutputMode', () => {
    test('a terminal gets the human mode with colour and a rewritten progress line', () => {
        expect(resolveOutputMode(terminal)).toEqual({
            kind: 'resolved',
            mode: { kind: 'human', color: true, rewritesProgress: true },
        });
    });

    test('a pipe or a file gets the plain mode', () => {
        expect(resolveOutputMode(pipe)).toEqual({ kind: 'resolved', mode: { kind: 'plain' } });
    });

    test('CI gets the plain mode even on a terminal', () => {
        expect(resolveOutputMode({ ...terminal, environment: { CI: 'true' } })).toEqual({
            kind: 'resolved',
            mode: { kind: 'plain' },
        });
    });

    test('NO_COLOR keeps the human layout and drops the colour', () => {
        expect(resolveOutputMode({ ...terminal, environment: { NO_COLOR: '1' } })).toMatchObject({
            mode: { kind: 'human', color: false },
        });
    });

    test('FORCE_COLOR=0 turns colour off and any other value turns it on', () => {
        expect(resolveOutputMode({ ...terminal, environment: { FORCE_COLOR: '0' } })).toMatchObject({
            mode: { color: false },
        });
        expect(
            resolveOutputMode({ ...pipe, flag: 'human', environment: { FORCE_COLOR: '1', NO_COLOR: '1' } }),
        ).toMatchObject({ mode: { kind: 'human', color: true, rewritesProgress: false } });
    });

    test('the variable picks the mode, and a flag overrides the variable', () => {
        expect(resolveOutputMode({ ...terminal, environment: { [outputModeVariable]: 'json' } })).toEqual({
            kind: 'resolved',
            mode: { kind: 'json' },
        });
        expect(
            resolveOutputMode({ ...terminal, flag: 'plain', environment: { [outputModeVariable]: 'json' } }),
        ).toEqual({ kind: 'resolved', mode: { kind: 'plain' } });
    });

    test('an unknown value of the variable is refused with the accepted values', () => {
        const resolution = resolveOutputMode({ ...pipe, environment: { [outputModeVariable]: 'yaml' } });
        expect(resolution.kind).toBe('invalid');
        expect(resolution.kind === 'invalid' ? resolution.reason : '').toContain('human, plain, json');
    });

    test('an empty variable counts as unset', () => {
        expect(resolveOutputMode({ ...pipe, environment: { [outputModeVariable]: '' } })).toEqual({
            kind: 'resolved',
            mode: { kind: 'plain' },
        });
    });
});
