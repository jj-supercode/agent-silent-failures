import { describe, expect, test } from 'vitest';

import { questionIdSchema } from '../../src/corpus/index.ts';
import { entryIdSchema } from '../../src/entries/index.ts';
import type { DemonstrationReport, PresetDemonstration } from '../../src/studio/demonstration/index.ts';
import { modelIdSchema } from '../../src/trace/index.ts';
import { firedPresetCount, matrixCounts, matrixRateFacts } from './matrix-report.ts';

const toolLoop = entryIdSchema.parse('tool-loop');
const questionId = questionIdSchema.parse('5ab92e3c554299753720f777');

const toolLoopRun: PresetDemonstration = {
    kind: 'ran',
    preset: 'search-drops-results',
    expectedEntry: toolLoop,
    traces: [
        { kind: 'agent-run', questionId, answer: 'a', outcomes: [{ entryId: toolLoop, kind: 'fired', reason: 'r' }] },
        { kind: 'agent-run', questionId, answer: 'b', outcomes: [{ entryId: toolLoop, kind: 'clear', reason: 'r' }] },
        { kind: 'run-failed', questionId, reason: 'cap reached' },
    ],
};

const notRun: PresetDemonstration = {
    kind: 'not-run',
    preset: 'supervisor-ignores-workers',
    expectedEntry: entryIdSchema.parse('ignored-worker-result'),
    reason: 'scripted-only',
};

const report: DemonstrationReport = {
    provenance: { source: 'live', platform: 'linux arm64', generatedOn: '2026-10-15', versions: {} },
    agentModel: modelIdSchema.parse('claude-haiku-5-5'),
    questionCount: 3,
    presets: [toolLoopRun, notRun],
    spend: null,
    basis: { kind: 'verdicts-only' },
};

describe('matrix report', () => {
    test('counts presets, firings, not-run presets, traces and failed runs', () => {
        expect(firedPresetCount(report)).toBe(1);
        expect(matrixCounts(report)).toEqual({
            presets: 2,
            firedPresets: 1,
            notRunPresets: 1,
            traces: 3,
            failedRuns: 1,
        });
    });

    test('one rate per preset that ran: its entry fired on this share of the traces, failed runs included', () => {
        expect(matrixRateFacts(report)).toEqual([
            expect.objectContaining({
                subject: 'search-drops-results',
                measure: 'tool-loop fired',
                events: 1,
                trials: 3,
            }),
        ]);
    });
});
