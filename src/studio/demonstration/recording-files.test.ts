import { describe, expect, test } from 'vitest';

import { unfinishedSession } from '../../record/index.ts';
import { createLineTally, noLinesYet, withLine } from './recording-files.ts';

describe('recording progress', () => {
    test('counts every line and the failed ones apart, and stays unfinished', () => {
        expect(withLine(withLine(noLinesYet, 'completed'), 'failed')).toEqual({
            recordedRuns: 2,
            failedRuns: 1,
            stoppedEarly: unfinishedSession,
        });
    });

    test('the tally reports what it has added so far', () => {
        const tally = createLineTally();
        expect(tally.read()).toEqual(noLinesYet);
        tally.add('completed');
        expect(tally.add('failed')).toEqual(tally.read());
        expect(tally.read()).toMatchObject({ recordedRuns: 2, failedRuns: 1 });
    });
});
