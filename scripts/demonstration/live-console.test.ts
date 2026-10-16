import { describe, expect, test } from 'vitest';

import { demonstrationSpendSchema, type DemonstrationReport } from '../../src/studio/demonstration/index.ts';
import { modelIdSchema } from '../../src/trace/index.ts';
import type { DemonstrationLiveOptions } from './live-command.ts';
import { liveMatrixReport } from './live-console.ts';
import { demonstrationResultFiles } from './result-files.ts';

const report: DemonstrationReport = {
    provenance: { source: 'recorded', platform: 'linux arm64', generatedOn: '2026-10-16', versions: {} },
    agentModel: modelIdSchema.parse('claude-haiku-5-5'),
    questionCount: 3,
    presets: [],
    spend: demonstrationSpendSchema.parse({ usd: 0.02, modelCalls: 40 }),
    basis: { kind: 'recorded-traces', fixtures: 'fixtures/demonstration/live/2026-10-16' },
};

const spend = demonstrationSpendSchema.parse({ usd: 0.02, modelCalls: 40 });
const directory = '/tmp/recording';

const closing = (options: DemonstrationLiveOptions, matrixFile: string | null) =>
    liveMatrixReport({ options, report, differences: [], spend, directory, matrixFile });

describe('liveMatrixReport', () => {
    test('a live run reports its billed spend and points at the README column it fills', () => {
        const live = closing({ mode: 'live', out: null, fixtures: null }, demonstrationResultFiles.live);
        expect(live.spendUsd).toBe(spend.usd);
        expect(live.counts).not.toHaveProperty('estimatedSpendUsd');
        expect(live.next.map((step) => step.command)).toEqual(['pnpm docs:tables']);
    });

    test('a dry run bills nothing: its estimate is a count, and it suggests nothing to commit', () => {
        const dryRun = closing({ mode: 'dry-run', out: null, fixtures: null }, null);
        expect(dryRun.spendUsd).toBeNull();
        expect(dryRun.counts).toMatchObject({ estimatedSpendUsd: spend.usd, modelCalls: spend.modelCalls });
        expect(dryRun.outputs).toEqual([directory]);
        expect(dryRun.next).toEqual([]);
    });
});
