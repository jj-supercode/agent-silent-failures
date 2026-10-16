import { describe, expect, test } from 'vitest';

import { parseStudioLaunch } from './studio-arguments.ts';

const scriptedCommand = ['mastra', 'dev', '--dir', 'src/mastra'] as const;

describe('parseStudioLaunch', () => {
    test('with no options it starts the wrapped command in scripted mode, leaving the fault to the environment', () => {
        expect(parseStudioLaunch(scriptedCommand)).toEqual({
            kind: 'start',
            mode: 'scripted',
            fault: null,
            command: scriptedCommand,
        });
    });

    test('takes the fault pnpm appended after the command out of it', () => {
        expect(parseStudioLaunch([...scriptedCommand, '--fault', 'search-errors'])).toEqual({
            kind: 'start',
            mode: 'scripted',
            fault: 'search-errors',
            command: scriptedCommand,
        });
        expect(parseStudioLaunch([...scriptedCommand, '--fault=search-errors'])).toMatchObject({
            fault: 'search-errors',
            command: scriptedCommand,
        });
    });

    test('a leading --live selects live mode and is not passed on', () => {
        expect(parseStudioLaunch(['--live', 'mastra', 'dev', '--dir', 'src/mastra-live'])).toEqual({
            kind: 'start',
            mode: 'live',
            fault: null,
            command: ['mastra', 'dev', '--dir', 'src/mastra-live'],
        });
    });

    test('--list-faults lists, whatever else is on the line', () => {
        expect(parseStudioLaunch([...scriptedCommand, '--list-faults'])).toEqual({ kind: 'list-faults' });
        expect(parseStudioLaunch([...scriptedCommand, '--fault', 'search-errors', '--list-faults'])).toEqual({
            kind: 'list-faults',
        });
    });

    test.each([[['--fault']], [['--fault', '--list-faults']], [['--fault=']]])(
        'a --fault without a preset id is refused: %j',
        (options) => {
            expect(parseStudioLaunch([...scriptedCommand, ...options])).toMatchObject({ kind: 'invalid' });
        },
    );

    test('nothing to wrap is refused', () => {
        expect(parseStudioLaunch(['--fault', 'search-errors'])).toMatchObject({ kind: 'invalid' });
    });
});
