import { describe, expect, test } from 'vitest';

import { entryIdSchema } from '../../src/entries/index.ts';
import type { DemonstrationReport } from '../../src/studio/demonstration/index.ts';
import { modelIdSchema } from '../../src/trace/index.ts';
import { scriptedMatrixReport } from './demonstration-console.ts';

const notRun: DemonstrationReport['presets'][number] = {
    kind: 'not-run',
    preset: 'supervisor-ignores-workers',
    expectedEntry: entryIdSchema.parse('ignored-worker-result'),
    reason: 'interrupted',
};

const report: DemonstrationReport = {
    provenance: { source: 'scripted', platform: 'linux arm64', generatedOn: '2026-10-15', versions: {} },
    agentModel: modelIdSchema.parse('scripted-policy'),
    questionCount: 3,
    presets: [],
    spend: null,
    basis: { kind: 'recorded-traces', fixtures: 'fixtures/demonstration/scripted/2026-10-15' },
};

const directory = '/tmp/recording';

describe('scriptedMatrixReport', () => {
    test('a written matrix where every preset fired exits 0 and names the recording, the result file and the docs', () => {
        const closing = scriptedMatrixReport({ report, differences: [], directory, action: 'write' });
        expect(closing.exit.code).toBe(0);
        expect(closing.outputs).toEqual([
            directory,
            'results/demonstration/scripted.json',
            'README.md',
            'docs/findings-in-mastra.md',
            'src/entries/*/README.md',
            'docs/images/charts/',
        ]);
    });

    test('a rehearsal names only its temporary recording, and how to write one', () => {
        const closing = scriptedMatrixReport({ report, differences: [], directory, action: 'rehearse' });
        expect(closing.outputs).toEqual([directory]);
        expect(closing.next[0]?.command).toBe('pnpm demonstration --write');
    });

    test('a preset that did not fire exits 1; a scoring difference outranks it with exit 5', () => {
        const unfired = { ...report, presets: [notRun] };
        expect(
            scriptedMatrixReport({ report: unfired, differences: [], directory, action: 'rehearse' }).exit.code,
        ).toBe(1);
        const differing = scriptedMatrixReport({
            report: unfired,
            differences: ['search-errors'],
            directory,
            action: 'rehearse',
        });
        expect(differing.exit.code).toBe(5);
        expect(differing.counts).toMatchObject({ scoringDifferences: 1 });
    });
});
