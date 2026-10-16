import { describe, expect, test } from 'vitest';

import { rateOf } from '../../src/bed/index.ts';
import type { SplitReport } from './model.ts';
import { searchOutage } from './lesson-subjects.ts';
import type { OutageAnswers } from './outage-answers.ts';
import { liveLessonsBlock } from './render-live-lessons.ts';
import { recordedLeadBlock } from './render-recorded-lead.ts';
import {
    sampleBedReport,
    sampleDetectorReport,
    sampleEntrySummary,
    sampleHeldOutSplit,
    sampleOutageVariation,
    sampleReplaySummary,
} from './testing.ts';

const firstSplit = sampleHeldOutSplit(
    [
        sampleDetectorReport('swallowed-tool-error', {
            falseAlarms: rateOf(0, 24),
            falseAlarmsByVariation: [sampleOutageVariation(rateOf(0, 12))],
        }),
        sampleDetectorReport('tool-loop', {
            falseAlarms: rateOf(3, 24),
            falseAlarmsByVariation: [sampleOutageVariation(rateOf(3, 12))],
        }),
    ],
    rateOf(1, 9),
);
const currentSplit = sampleHeldOutSplit(
    [
        sampleDetectorReport('swallowed-tool-error', {
            falseAlarms: rateOf(0, 24),
            falseAlarmsByVariation: [sampleOutageVariation(rateOf(0, 12))],
        }),
        sampleDetectorReport('tool-loop', {
            falseAlarms: rateOf(0, 24),
            falseAlarmsByVariation: [sampleOutageVariation(rateOf(0, 12))],
        }),
    ],
    rateOf(0, 11),
);
const fixture = 'fixtures/live/2026-10-15';

describe('recordedLeadBlock', () => {
    const input = {
        replaySummary: sampleReplaySummary(fixture, 'recorded'),
        replayReport: sampleBedReport('recorded', currentSplit),
        firstScoring: {
            summary: sampleReplaySummary(fixture, 'recorded'),
            report: sampleBedReport('recorded', firstSplit),
        },
        offlineHeldOut: undefined,
        offlineProvenance: 'scripted, darwin arm64',
        entries: [sampleEntrySummary('tool-loop', 'run'), sampleEntrySummary('embedding-coverage', 'ingestion')],
    };

    test('leads with recorded false alarms and counts the clean recorded runs', () => {
        const block = recordedLeadBlock(input);
        expect(block).toContain('24 clean runs');
        expect(block).toContain('no detector fired on a clean recorded run');
        expect(block).toContain('found 3 false alarms in `tool-loop`');
        expect(block).toContain('in-sample');
    });

    test('a first scoring of another recording is not called the same recording, and no rate is in-sample', () => {
        const block = recordedLeadBlock({
            ...input,
            firstScoring: {
                ...input.firstScoring,
                summary: sampleReplaySummary('fixtures/live/2026-09-01', 'recorded'),
            },
        });
        expect(block).not.toContain('first scoring of the same recording');
        expect(block).not.toContain('in-sample');
    });

    test('says an ingestion entry cannot be recorded instead of printing a rate', () => {
        expect(recordedLeadBlock(input)).toContain('not recordable: ingestion calls no model');
    });

    test('never presents a dry-run set as recorded', () => {
        const block = recordedLeadBlock({
            ...input,
            replaySummary: sampleReplaySummary('fixtures/dry-run/2026-10-15', 'scripted'),
        });
        expect(block).toContain('every number below is `scripted`');
    });
});

describe('liveLessonsBlock', () => {
    const scoring = (summaryFixture: string, heldOut: SplitReport) => ({
        summary: sampleReplaySummary(summaryFixture, 'recorded'),
        report: sampleBedReport('recorded', heldOut),
        offline: sampleBedReport('scripted', heldOut),
    });
    const everyAnswerDeclined: OutageAnswers = {
        variation: searchOutage,
        runs: 12,
        declined: 12,
        declinedButNamedGold: 0,
        answeredFromWorkingCalls: 0,
        answeredWithoutWorkingCalls: 0,
    };
    const outages = [everyAnswerDeclined];

    test('compares the first and the current scoring of the same recording', () => {
        const block = liveLessonsBlock({
            firstScoring: scoring(fixture, firstSplit),
            currentScoring: scoring(fixture, currentSplit),
            outageAnswers: outages,
        });
        expect(block).toContain('| `tool-loop` false alarms, recorded clean runs (in-sample) | 3/24, 12.5%');
        expect(block).toContain('in-sample');
        expect(block).toContain(
            'Single-agent: 12 of 12 answers declined, 0 of them still named the right answer further on',
        );
        expect(block).toContain('called that a cycle on 3 clean runs under search errors');
        expect(block).toContain('`swallowed-tool-error` fired on 0/12');
        expect(block).toContain('read 1/9, 11.1%');
    });

    test('changes the outage heading when an answer rested on no working call', () => {
        const blind = [{ ...everyAnswerDeclined, declined: 11, answeredWithoutWorkingCalls: 1 }];
        const block = liveLessonsBlock({
            firstScoring: scoring(fixture, firstSplit),
            currentScoring: scoring(fixture, currentSplit),
            outageAnswers: blind,
        });
        expect(block).toContain('some answers rested on no working call');
        expect(block).not.toContain('did not pass off a guess');
    });

    test('shows no comparison across two different recordings', () => {
        const block = liveLessonsBlock({
            firstScoring: scoring('fixtures/live/2026-01-01', firstSplit),
            currentScoring: scoring(fixture, currentSplit),
            outageAnswers: outages,
        });
        expect(block).toContain('no before and after to show');
    });
});
