import { describe, expect, test } from 'vitest';

import { studioFaultVariable } from '../faults/studio-fault-option.ts';
import type { StudioLaunch } from './studio-arguments.ts';
import { decideStudioStart } from './studio-start.ts';

const command = ['mastra', 'dev', '--dir', 'src/mastra'] as const;

const start = (mode: 'scripted' | 'live', fault: string | null): StudioLaunch => ({
    kind: 'start',
    mode,
    fault,
    command,
});

describe('decideStudioStart', () => {
    test('serves the command with the chosen preset in the environment', () => {
        expect(decideStudioStart(start('scripted', 'search-errors'), { PATH: '/bin' })).toEqual({
            kind: 'serve',
            command,
            environment: { PATH: '/bin', [studioFaultVariable]: 'search-errors' },
        });
    });

    test('without --fault the preset already in the environment is used, and checked', () => {
        expect(decideStudioStart(start('scripted', null), { [studioFaultVariable]: 'search-errors' })).toMatchObject({
            kind: 'serve',
            environment: { [studioFaultVariable]: 'search-errors' },
        });
        expect(decideStudioStart(start('scripted', null), { [studioFaultVariable]: 'nope' })).toMatchObject({
            kind: 'refused',
            exitCode: 2,
        });
    });

    test('--fault wins over the environment, and a clean session clears it', () => {
        expect(
            decideStudioStart(start('scripted', 'search-errors'), { [studioFaultVariable]: 'collapsed-embedder' }),
        ).toMatchObject({ environment: { [studioFaultVariable]: 'search-errors' } });
        expect(decideStudioStart(start('scripted', null), {})).toMatchObject({
            environment: { [studioFaultVariable]: '' },
        });
    });

    test('a scripted-only preset is refused live, before anything starts', () => {
        const refused = decideStudioStart(start('live', 'supervisor-ignores-workers'), {});
        expect(refused).toMatchObject({ kind: 'refused', exitCode: 2 });
        expect(refused.kind === 'refused' && refused.reason).toContain('Nothing was sent');
    });

    test('--list-faults prints the listing and an unreadable command line is refused', () => {
        expect(decideStudioStart({ kind: 'list-faults' }, {})).toMatchObject({ kind: 'print' });
        expect(decideStudioStart({ kind: 'invalid', reason: 'no command' }, {})).toEqual({
            kind: 'refused',
            reason: 'no command',
            exitCode: 2,
        });
    });
});
