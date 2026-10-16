import { describe, expect, test } from 'vitest';

import { plainStyle } from '../../command-output/text-style.ts';
import { summarize } from '../summary/summarize.ts';
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
import { detectorRateFacts } from './detector-rate-facts.ts';
import { detectorTableLines } from './detector-table.ts';
import { splitTitle } from '../render/markdown-report.ts';

const caughtRuns = 9;
const missedRuns = 1;
const notExpressedRuns = 2;
const cleanRuns = 40;
const falseAlarmRuns = 2;

const report = summarize([
    ...sampleRuns(caughtRuns, {
        condition: faultedCondition(sampleEntryId),
        verdicts: [entryVerdict(sampleEntryId, firedVerdict)],
    }),
    ...sampleRuns(missedRuns, {
        condition: faultedCondition(sampleEntryId),
        verdicts: [entryVerdict(sampleEntryId, clearVerdict)],
    }),
    ...sampleRuns(notExpressedRuns, {
        condition: faultedCondition(sampleEntryId, 'sample-fault', 'level-1', 'not-expressed'),
        verdicts: [entryVerdict(sampleEntryId, notApplicableVerdict)],
    }),
    ...sampleRuns(cleanRuns, { condition: cleanCondition(), verdicts: [entryVerdict(sampleEntryId, clearVerdict)] }),
    ...sampleRuns(falseAlarmRuns, {
        condition: cleanCondition(),
        verdicts: [entryVerdict(sampleEntryId, firedVerdict)],
    }),
]);

describe('detector console output', () => {
    test('one aligned row per detector, with a footnote where a fault changed nothing observable', () => {
        const [split] = report.splits;
        expect(split === undefined ? [] : [splitTitle(split), ...detectorTableLines(split, plainStyle)]).toEqual([
            'Held-out split: 54 agent runs, 0 ingestions',
            'detector      caught         95% interval    false alarms        95% interval',
            'sample-entry   9/12*  75.0%  [46.8%, 91.1%]          2/42  4.8%  [1.3%, 15.8%]',
            '* sample-entry: on 2 runs the fault changed nothing observable; caught when expressed 9/10 = 90.0%',
        ]);
    });

    test('JSON rates are exact and name their split, entry and measure', () => {
        expect(detectorRateFacts(report)).toEqual([
            expect.objectContaining({
                group: 'held-out',
                subject: 'sample-entry',
                measure: 'caught',
                events: 9,
                trials: 12,
                share: 0.75,
            }),
            expect.objectContaining({ measure: 'caught-when-expressed', events: 9, trials: 10, share: 0.9 }),
            expect.objectContaining({ measure: 'false-alarms', events: 2, trials: 42, share: 2 / 42 }),
        ]);
    });
});
