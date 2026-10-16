import { describe, expect, test } from 'vitest';

import { rateOf } from '../../src/bed/index.ts';
import { compareScorings } from '../docs-tables/index.ts';
import {
    sampleBedReport,
    sampleDetectorReport,
    sampleEntrySummary,
    sampleHeadline,
    sampleHeldOutSplit,
    sampleReplaySummary,
} from '../docs-tables/testing.ts';
import { lessonsChart } from './lessons-chart.ts';
import type { ChartMark, ChartSpec } from './model.ts';
import { reliabilityChart } from './reliability-chart.ts';
import { retrievalChart } from './retrieval-chart.ts';

const fixture = 'fixtures/live/2026-10-15';
const marksOf = (spec: ChartSpec, panelIndex: number): readonly ChartMark[] =>
    spec.panels[panelIndex]?.rows.flatMap((row) => row.marks) ?? [];

describe('retrievalChart', () => {
    const spec = retrievalChart(sampleHeadline(undefined));

    test('plots head, tail and fitted-tail retrieval, then Memory recall, from the repro evidence', () => {
        expect(spec.panels.map((panel) => panel.rows.map((row) => row.label))).toEqual([
            [
                "Sentence from a chunk's head",
                "Sentence from a chunk's tail",
                'Same tail sentence, chunks of 1,500 characters',
            ],
            ['Sentence in the first 512 tokens', 'Sentence after token 512'],
        ]);
        expect(marksOf(spec, 0).map((mark) => (mark.kind === 'estimate' ? mark.estimate.events : null))).toEqual([
            83, 37, 100,
        ]);
    });

    test('colours a query by whether its text was embedded, and names the repro files it came from', () => {
        expect(marksOf(spec, 1).map((mark) => mark.series.slot)).toEqual([0, 1]);
        expect(spec.footnote).toContain('results/repros/fastembed-truncation.json');
        expect(spec.footnote).toContain('results/repros/memory-fastembed-truncation.json');
    });
});

describe('reliabilityChart', () => {
    const entries = [sampleEntrySummary('embedding-coverage', 'ingestion'), sampleEntrySummary('tool-loop', 'run')];
    const scripted = sampleHeldOutSplit(
        [
            sampleDetectorReport('embedding-coverage', { falseAlarms: rateOf(0, 288), caught: rateOf(113, 120) }),
            sampleDetectorReport('tool-loop', { falseAlarms: rateOf(0, 552), caught: rateOf(144, 144) }),
        ],
        rateOf(0, 12),
    );
    const recordedSplit = sampleHeldOutSplit(
        [sampleDetectorReport('tool-loop', { falseAlarms: rateOf(0, 312) })],
        rateOf(0, 12),
    );
    const recorded = { summary: sampleReplaySummary(fixture, 'recorded'), heldOut: recordedSplit, inSample: true };

    test('shows scripted and recorded side by side and says why a recorded value is missing', () => {
        const spec = reliabilityChart({ entries, scripted, recorded });
        expect(spec.series.map((series) => series.name)).toEqual([
            'Scripted bed, held-out split',
            'Recorded from claude-haiku-5-5',
        ]);
        expect(marksOf(spec, 0)).toContainEqual({
            kind: 'missing',
            series: spec.series[1],
            note: 'not recordable: ingestion calls no model',
        });
        expect(marksOf(spec, 0)).toContainEqual({
            kind: 'missing',
            series: spec.series[1],
            note: 'no recorded fault runs',
        });
    });

    test('states from the data that no detector fired on a clean run, and marks recorded values in-sample', () => {
        const spec = reliabilityChart({ entries, scripted, recorded });
        expect(spec.title).toBe('None of the 2 detectors fired on a clean run, scripted or recorded');
        expect(spec.panels[1]?.heading).toContain('recorded values in-sample');
        expect(spec.panels[1]?.axisMax).toBe(0.05);
    });

    test('a false alarm changes the title, and without a recording only the scripted series is drawn', () => {
        const noisy = sampleHeldOutSplit(
            [sampleDetectorReport('tool-loop', { falseAlarms: rateOf(3, 552), caught: rateOf(144, 144) })],
            rateOf(0, 12),
        );
        const spec = reliabilityChart({ entries, scripted: noisy, recorded: null });
        expect(spec.title).toBe('Detector catch rates on faulted runs and false alarms on clean runs');
        expect(spec.series).toHaveLength(1);
    });

    test('without a scripted held-out split it draws no panel and says how to make one', () => {
        const spec = reliabilityChart({ entries, scripted: undefined, recorded });
        expect(spec.panels).toEqual([]);
        expect(spec.subtitle).toContain('pnpm bed');
    });
});

describe('lessonsChart', () => {
    const scoring = (falseAlarms: number, trials: number) => {
        const split = sampleHeldOutSplit(
            [
                sampleDetectorReport('tool-loop', { falseAlarms: rateOf(falseAlarms, trials) }),
                sampleDetectorReport('flat-score', { falseAlarms: rateOf(0, trials) }),
            ],
            rateOf(0, 12),
        );
        return {
            summary: sampleReplaySummary(fixture, 'recorded'),
            report: sampleBedReport('recorded', split),
            offline: sampleBedReport('scripted', split),
        };
    };

    test('plots only the entries whose recorded false alarms changed, first scoring against now', () => {
        const spec = lessonsChart({ comparison: compareScorings(scoring(9, 312), scoring(0, 312)), fixture });
        expect(spec.title).toBe('Recorded false alarms: 9 at first scoring, 0 after the rule changes (in-sample)');
        expect(spec.panels[0]?.rows.map((row) => row.label)).toEqual(['tool-loop']);
        expect(marksOf(spec, 0).map((mark) => mark.series.name)).toEqual([
            'First scoring',
            'Now, after the rule changes',
        ]);
    });

    test('two scorings with the same false alarms plot nothing and never claim rule changes', () => {
        const spec = lessonsChart({ comparison: compareScorings(scoring(9, 312), scoring(9, 312)), fixture });
        expect(spec.panels).toEqual([]);
        expect(spec.title).toBe('No recorded false alarm changed since the first scoring');
    });

    test('two scorings of different recordings give no before and after', () => {
        const other = { ...scoring(0, 312), summary: sampleReplaySummary('fixtures/live/2026-11-01', 'recorded') };
        const spec = lessonsChart({ comparison: compareScorings(scoring(9, 312), other), fixture });
        expect(spec.panels).toEqual([]);
        expect(spec.title).toBe('No before and after to show');
    });
});
