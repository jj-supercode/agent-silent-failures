import { describe, expect, test } from 'vitest';

import { rateOf } from '../../src/bed/index.ts';
import type { SplitReport } from './model.ts';
import { catchSentence, compareScorings, type ScoringComparison } from './render-scoring-comparison.ts';
import {
    noRunsSample,
    sampleBedReport,
    sampleDetectorReport,
    sampleHeldOutSplit,
    sampleReplaySummary,
} from './testing.ts';

const recordedSplit = sampleHeldOutSplit([], noRunsSample);

const scoring = (fixture: string, report = sampleBedReport('recorded', recordedSplit)) => ({
    summary: sampleReplaySummary(fixture, 'recorded'),
    report,
    offline: sampleBedReport('scripted', recordedSplit),
});

const offlineCatching = (toolLoopCaught: number, toolLoopTrials: number): SplitReport =>
    sampleHeldOutSplit(
        [
            sampleDetectorReport('tool-loop', {
                falseAlarms: rateOf(0, 10),
                caught: rateOf(toolLoopCaught, toolLoopTrials),
            }),
            sampleDetectorReport('ignored-worker-result', { falseAlarms: rateOf(0, 10), caught: rateOf(46, 48) }),
        ],
        noRunsSample,
    );

const comparison = (firstOffline: SplitReport, currentOffline: SplitReport): ScoringComparison => ({
    first: recordedSplit,
    current: recordedSplit,
    firstOffline,
    currentOffline,
});

describe('compareScorings', () => {
    test('pairs two scorings of the same recording', () => {
        expect(compareScorings(scoring('fixtures/live/a'), scoring('fixtures/live/a')).kind).toBe('comparable');
    });

    test('refuses two different recordings', () => {
        const compared = compareScorings(scoring('fixtures/live/a'), scoring('fixtures/live/b'));
        expect(compared.kind === 'not-comparable' && compared.reason).toContain('another recorded set');
    });

    test('refuses a scoring without a held-out split', () => {
        const withoutSplits = { ...sampleBedReport('recorded', recordedSplit), splits: [] };
        const compared = compareScorings(scoring('fixtures/live/a', withoutSplits), scoring('fixtures/live/a'));
        expect(compared.kind === 'not-comparable' && compared.reason).toContain('no held-out split');
    });
});

describe('catchSentence', () => {
    test('says the exemptions did not blunt detection, and names an entry whose fault runs grew', () => {
        const sentence = catchSentence(comparison(offlineCatching(120, 120), offlineCatching(144, 144)));
        expect(sentence).toContain('did not blunt detection');
        expect(sentence).toContain('the counts of `tool-loop` include new fault runs');
    });

    test('names an entry whose catch share dropped', () => {
        const sentence = catchSentence(comparison(offlineCatching(120, 120), offlineCatching(110, 120)));
        expect(sentence).toContain('the catch rate of `tool-loop` dropped');
    });
});
