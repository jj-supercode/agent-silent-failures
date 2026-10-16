import { describe, expect, test } from 'vitest';

import type { SweepPoint } from '../model.ts';
import {
    cleanCondition,
    clearVerdict,
    entryVerdict,
    faultedCondition,
    firedVerdict,
    notApplicableVerdict,
    sampleEntryId,
    sampleRuns,
} from '../testing.ts';
import { thresholdSensitivity } from './threshold-sensitivity.ts';

const threshold = 'LIMIT';
const defaultValue = 2;

const point = (value: number, outcome: SweepPoint['outcome']): SweepPoint => ({
    threshold,
    value,
    isDefault: value === defaultValue,
    outcome,
});

const faultedRuns = 4;
const notExpressedRuns = 3;
const cleanRunCount = 10;
const notApplicableAtDefaultRuns = 5;

const runs = [
    ...sampleRuns(faultedRuns, {
        condition: faultedCondition(sampleEntryId),
        verdicts: [
            entryVerdict(sampleEntryId, firedVerdict, [point(1, 'fired'), point(2, 'fired'), point(3, 'clear')]),
        ],
    }),
    ...sampleRuns(notExpressedRuns, {
        condition: faultedCondition(sampleEntryId, 'sample-fault', 'level-1', 'not-expressed'),
        verdicts: [
            entryVerdict(sampleEntryId, clearVerdict, [point(1, 'clear'), point(2, 'clear'), point(3, 'clear')]),
        ],
    }),
    ...sampleRuns(cleanRunCount, {
        condition: cleanCondition(),
        verdicts: [
            entryVerdict(sampleEntryId, clearVerdict, [point(1, 'fired'), point(2, 'clear'), point(3, 'clear')]),
        ],
    }),
    ...sampleRuns(notApplicableAtDefaultRuns, {
        condition: cleanCondition(),
        verdicts: [
            entryVerdict(sampleEntryId, notApplicableVerdict, [
                point(1, 'fired'),
                point(2, 'not-applicable'),
                point(3, 'not-applicable'),
            ]),
        ],
    }),
];

describe('thresholdSensitivity', () => {
    const [sweep] = thresholdSensitivity(runs, sampleEntryId);
    const at = (value: number) => sweep?.points.find((entry) => entry.value === value);

    test('reports every swept value in ascending order and marks the default', () => {
        expect(sweep?.points.map((entry) => [entry.value, entry.isDefault])).toEqual([
            [1, false],
            [2, true],
            [3, false],
        ]);
    });

    test('catches count only runs where the fault took effect', () => {
        expect(at(defaultValue)?.caught).toMatchObject({ events: faultedRuns, trials: faultedRuns });
        expect(at(3)?.caught).toMatchObject({ events: 0, trials: faultedRuns });
    });

    test('false alarms count the clean runs judged at that value, even ones not applicable at the default', () => {
        expect(at(1)?.falseAlarms).toMatchObject({
            events: cleanRunCount + notApplicableAtDefaultRuns,
            trials: cleanRunCount + notApplicableAtDefaultRuns,
        });
        expect(at(defaultValue)?.falseAlarms).toMatchObject({ events: 0, trials: cleanRunCount });
    });

    test('an entry without sweeps has no sensitivity rows', () => {
        const unswept = sampleRuns(1, {
            condition: cleanCondition(),
            verdicts: [entryVerdict(sampleEntryId, clearVerdict)],
        });
        expect(thresholdSensitivity(unswept, sampleEntryId)).toEqual([]);
    });
});
