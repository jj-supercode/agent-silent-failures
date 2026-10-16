import { describe, expect, test } from 'vitest';

import { questionIdSchema } from '../../corpus/index.ts';
import { entryIdSchema } from '../../entries/index.ts';
import { modelIdSchema } from '../../trace/index.ts';
import type { DemonstrationReport, PresetDemonstration } from './model.ts';
import { scoringDifferences } from './scoring-differences.ts';

const toolLoop = entryIdSchema.parse('tool-loop');
const questionId = questionIdSchema.parse('5ab92e3c554299753720f777');

const toolLoopRun = (reason: string): PresetDemonstration => ({
    kind: 'ran',
    preset: 'search-drops-results',
    expectedEntry: toolLoop,
    traces: [{ kind: 'agent-run', questionId, answer: 'A.', outcomes: [{ entryId: toolLoop, kind: 'fired', reason }] }],
});

const fromRecording = (presets: readonly PresetDemonstration[]): DemonstrationReport => ({
    provenance: { source: 'recorded', platform: 'linux arm64', generatedOn: '2026-10-16', versions: {} },
    agentModel: modelIdSchema.parse('claude-haiku-5-5'),
    questionCount: 1,
    presets,
    spend: null,
    basis: { kind: 'recorded-traces', fixtures: 'fixtures/demonstration/live/2026-10-16' },
});

describe('scoringDifferences', () => {
    test('equal verdicts make no difference', () => {
        expect(scoringDifferences([toolLoopRun('looped')], fromRecording([toolLoopRun('looped')]))).toEqual([]);
    });

    test('a changed reason or a preset missing from the recording is a difference', () => {
        expect(scoringDifferences([toolLoopRun('looped')], fromRecording([toolLoopRun('looped twice')]))).toEqual([
            'search-drops-results',
        ]);
        expect(scoringDifferences([toolLoopRun('looped')], fromRecording([]))).toEqual(['search-drops-results']);
    });
});
