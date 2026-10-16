import { describe, expect, test } from 'vitest';

import { questionIdSchema } from '../../corpus/index.ts';
import { entryIdSchema } from '../../entries/index.ts';
import type { EntryOutcome, PresetDemonstration } from './model.ts';
import { otherFiredEntries, presetVerdict } from './preset-verdict.ts';

const toolLoop = entryIdSchema.parse('tool-loop');
const emptyRetrieval = entryIdSchema.parse('empty-retrieval-answered');
const questionId = questionIdSchema.parse('5a8b57f25542995d1e6f1371');

const outcome = (entryId: typeof toolLoop, kind: EntryOutcome['kind'], reason: string): EntryOutcome => ({
    entryId,
    kind,
    reason,
});

const ranWith = (traces: Extract<PresetDemonstration, { kind: 'ran' }>['traces']): PresetDemonstration => ({
    kind: 'ran',
    preset: 'search-drops-results',
    expectedEntry: toolLoop,
    traces,
});

const agentRun = (outcomes: readonly EntryOutcome[]) => ({
    kind: 'agent-run' as const,
    questionId,
    answer: 'An answer.',
    outcomes,
});

describe('presetVerdict', () => {
    test('counts the traces its entry fired on and quotes the first firing', () => {
        const verdict = presetVerdict(
            ranWith([
                agentRun([outcome(toolLoop, 'clear', 'no repeat')]),
                agentRun([outcome(toolLoop, 'fired', 'fired, severity 0.33: three searches')]),
                agentRun([outcome(toolLoop, 'fired', 'fired, severity 0.67: five searches')]),
            ]),
        );
        expect(verdict).toEqual({
            kind: 'fired',
            fired: 2,
            traces: 3,
            evidence: 'fired, severity 0.33: three searches',
        });
    });

    test('a preset that never fired reports why, with failed runs counted, never hidden', () => {
        const verdict = presetVerdict(
            ranWith([
                { kind: 'run-failed', questionId, reason: 'RunBudgetExceededError: cap reached' },
                agentRun([outcome(toolLoop, 'clear', 'no tool call repeated 3 times')]),
            ]),
        );
        expect(verdict).toEqual({
            kind: 'not-fired',
            traces: 2,
            failedRuns: 1,
            evidence: 'no tool call repeated 3 times',
        });
    });

    test('when every run failed, the failure is the evidence', () => {
        expect(presetVerdict(ranWith([{ kind: 'run-failed', questionId, reason: 'cap reached' }]))).toMatchObject({
            kind: 'not-fired',
            evidence: 'run failed: cap reached',
        });
    });

    test('a preset that was not run says so', () => {
        expect(
            presetVerdict({
                kind: 'not-run',
                preset: 'supervisor-ignores-workers',
                expectedEntry: entryIdSchema.parse('ignored-worker-result'),
                reason: 'scripted-only',
            }),
        ).toEqual({ kind: 'not-run', reason: 'scripted-only' });
    });
});

describe('otherFiredEntries', () => {
    test('lists each other entry that fired once, and never the expected one', () => {
        const demonstration = ranWith([
            agentRun([outcome(toolLoop, 'fired', 'loop'), outcome(emptyRetrieval, 'fired', 'answered anyway')]),
            agentRun([outcome(emptyRetrieval, 'fired', 'answered anyway')]),
        ]);
        expect(otherFiredEntries(demonstration)).toEqual([emptyRetrieval]);
    });
});
