import { describe, expect, test } from 'vitest';

import {
    cleanCondition,
    clearVerdict,
    entryVerdict,
    faultedCondition,
    firedVerdict,
    notApplicableVerdict,
    otherEntryId,
    sampleEntryId,
    sampleRuns,
} from '../testing.ts';
import { summarize } from './summarize.ts';

const caughtRuns = 9;
const missedRuns = 1;
const cleanClearRuns = 18;
const falseAlarmRuns = 2;
const notApplicableCleanRuns = 5;

const runs = [
    ...sampleRuns(caughtRuns, {
        condition: faultedCondition(sampleEntryId),
        verdicts: [entryVerdict(sampleEntryId, firedVerdict), entryVerdict(otherEntryId, clearVerdict)],
    }),
    ...sampleRuns(missedRuns, {
        condition: faultedCondition(sampleEntryId),
        verdicts: [entryVerdict(sampleEntryId, notApplicableVerdict), entryVerdict(otherEntryId, firedVerdict)],
    }),
    ...sampleRuns(cleanClearRuns, {
        condition: cleanCondition(),
        verdicts: [entryVerdict(sampleEntryId, clearVerdict), entryVerdict(otherEntryId, clearVerdict)],
    }),
    ...sampleRuns(falseAlarmRuns, {
        condition: cleanCondition('tempting', [sampleEntryId]),
        verdicts: [entryVerdict(sampleEntryId, firedVerdict), entryVerdict(otherEntryId, clearVerdict)],
    }),
    ...sampleRuns(notApplicableCleanRuns, {
        condition: cleanCondition(),
        verdicts: [entryVerdict(sampleEntryId, notApplicableVerdict), entryVerdict(otherEntryId, clearVerdict)],
    }),
    ...sampleRuns(1, {
        split: 'dev',
        condition: cleanCondition(),
        verdicts: [entryVerdict(sampleEntryId, firedVerdict)],
    }),
];

const heldOut = summarize(runs).splits.find((split) => split.split === 'held-out');
const detector = heldOut?.detectors.find((report) => report.entryId === sampleEntryId);

describe('summarize', () => {
    test('reports each split apart and never pools dev into held-out', () => {
        const report = summarize(runs);
        expect(report.splits.map((split) => split.split)).toEqual(['dev', 'held-out']);
        expect(heldOut?.agentRuns).toBe(runs.length - 1);
    });

    test('a not-applicable verdict on an own-fault run counts as a miss', () => {
        expect(detector?.caught).toMatchObject({ events: caughtRuns, trials: caughtRuns + missedRuns });
        expect(detector?.notApplicableOnFaulted).toBe(missedRuns);
    });

    test('false alarms count only clean runs the detector judged', () => {
        expect(detector?.falseAlarms).toMatchObject({
            events: falseAlarmRuns,
            trials: cleanClearRuns + falseAlarmRuns,
        });
    });

    test('per-variation lines mark hard negatives and count not-applicable runs', () => {
        const byVariation = detector?.falseAlarmsByVariation ?? [];
        expect(byVariation.map((line) => [line.variation, line.hardNegative, line.notApplicable])).toEqual([
            ['baseline', false, notApplicableCleanRuns],
            ['tempting', true, 0],
        ]);
    });

    test('the confusion matrix scores every entry on every condition', () => {
        const faultRow = heldOut?.confusion.find((row) => row.ownEntryId === sampleEntryId);
        const otherCell = faultRow?.firedByEntry.find((cell) => cell.entryId === otherEntryId);
        expect(otherCell?.fired).toMatchObject({ events: missedRuns, trials: caughtRuns + missedRuns });
    });

    test('the headline keeps one row per clean variation, pools faults over severities and reports task outcome', () => {
        expect(heldOut?.headline.map((row) => row.condition)).toEqual([
            'sample-fault (sample-entry)',
            'clean: baseline',
            'clean: tempting',
        ]);
        const cleanRow = heldOut?.headline.find((row) => row.condition === 'clean: baseline');
        expect(cleanRow?.agentRuns).toBe(cleanClearRuns + notApplicableCleanRuns);
        expect(cleanRow?.goldAnswerFound.share).toBe(1);
        expect(cleanRow?.meanGoldSentenceRecall).toBe(1);
    });

    test('a fault that did not take effect is reported apart and left out of the expressed catch rate', () => {
        const expressedRuns = 5;
        const notExpressedRuns = 2;
        const report = summarize([
            ...sampleRuns(expressedRuns, {
                condition: faultedCondition(sampleEntryId),
                verdicts: [entryVerdict(sampleEntryId, firedVerdict)],
            }),
            ...sampleRuns(notExpressedRuns, {
                condition: faultedCondition(sampleEntryId, 'sample-fault', 'level-1', 'not-expressed'),
                verdicts: [entryVerdict(sampleEntryId, clearVerdict)],
            }),
        ]);
        const [summary] = report.splits[0]?.detectors ?? [];
        expect(summary?.caught).toMatchObject({ events: expressedRuns, trials: expressedRuns + notExpressedRuns });
        expect(summary?.caughtWhenExpressed).toMatchObject({ events: expressedRuns, trials: expressedRuns });
        expect(summary?.notExpressed).toBe(notExpressedRuns);
        expect(summary?.caughtBySeverity[0]?.notExpressed).toBe(notExpressedRuns);
        expect(summary?.firedWhenNotExpressed).toBe(0);
    });

    test('a detector firing on a run where the fault had no observed effect is counted as a disagreement', () => {
        const disagreeingRuns = 2;
        const report = summarize(
            sampleRuns(disagreeingRuns, {
                condition: faultedCondition(sampleEntryId, 'sample-fault', 'level-1', 'not-expressed'),
                verdicts: [entryVerdict(sampleEntryId, firedVerdict)],
            }),
        );
        const [summary] = report.splits[0]?.detectors ?? [];
        expect(summary?.firedWhenNotExpressed).toBe(disagreeingRuns);
        expect(summary?.caughtBySeverity[0]?.firedWhenNotExpressed).toBe(disagreeingRuns);
        expect(summary?.caughtWhenExpressed.trials).toBe(0);
    });

    test('no runs give an empty report', () => {
        expect(summarize([])).toEqual({ sources: [], splits: [] });
    });
});
