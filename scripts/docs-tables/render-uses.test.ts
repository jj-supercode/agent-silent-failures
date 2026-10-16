import { describe, expect, test } from 'vitest';

import { rateOf } from '../../src/bed/index.ts';
import { questionIdSchema } from '../../src/corpus/index.ts';
import { entryIdSchema } from '../../src/entries/index.ts';
import type { DemonstrationReport, PresetDemonstration } from '../../src/studio/demonstration/index.ts';
import { modelIdSchema } from '../../src/trace/index.ts';
import { pitchBlock } from './render-pitch.ts';
import { usesBlock } from './render-uses.ts';
import {
    sampleBedReport,
    sampleDetectorReport,
    sampleHeadline,
    sampleHeldOutSplit,
    sampleReplaySummary,
} from './testing.ts';

const questionId = questionIdSchema.parse('5ab92e3c554299753720f777');
const flatScore = entryIdSchema.parse('flat-score');

const collapsedEmbedder = (kind: 'fired' | 'clear', reason: string): PresetDemonstration => ({
    kind: 'ran',
    preset: 'collapsed-embedder',
    expectedEntry: flatScore,
    traces: [{ kind: 'agent-run', questionId, answer: 'An answer.', outcomes: [{ entryId: flatScore, kind, reason }] }],
});

const report = (presets: readonly PresetDemonstration[], source: 'scripted' | 'live'): DemonstrationReport => ({
    provenance: { source, platform: 'linux arm64', generatedOn: '2026-10-15', versions: {} },
    agentModel: modelIdSchema.parse(source === 'live' ? 'claude-haiku-5-5' : 'scripted-policy'),
    questionCount: 1,
    presets,
    spend: null,
    basis: { kind: 'verdicts-only' },
});

const recorded = sampleHeldOutSplit([sampleDetectorReport('tool-loop', { falseAlarms: rateOf(0, 24) })], rateOf(0, 12));
const input = (live: DemonstrationReport | null) => ({
    demonstration: {
        scripted: report([collapsedEmbedder('fired', 'fired, severity 1.00: scripted evidence')], 'scripted'),
        live,
    },
    replaySummary: sampleReplaySummary('fixtures/live/2026-10-15', 'recorded'),
    replayReport: sampleBedReport('recorded', recorded),
});

describe('usesBlock', () => {
    test('lists five uses, each with an example', () => {
        const block = usesBlock(input(null));
        expect(block.match(/^- \*\*/gm)).toHaveLength(5);
        expect(block.match(/^ {4}- Example: /gm)).toHaveLength(5);
    });

    test('quotes a live firing when the live run fired, labelled with the model and preset', () => {
        const live = report([collapsedEmbedder('fired', 'fired, severity 1.00: live evidence')], 'live');
        expect(usesBlock(input(live))).toContain(
            '"fired, severity 1.00: live evidence" (live, `claude-haiku-5-5`, preset `collapsed-embedder`)',
        );
    });

    test('a live ingestion firing is never attributed to the model', () => {
        const coverage = entryIdSchema.parse('embedding-coverage');
        const ingestion: PresetDemonstration = {
            kind: 'ran',
            preset: 'default-chunk-size',
            expectedEntry: coverage,
            traces: [
                {
                    kind: 'ingestion',
                    outcomes: [{ entryId: coverage, kind: 'fired', reason: 'fired: chunks overflow' }],
                },
            ],
        };
        expect(usesBlock(input(report([ingestion], 'live')))).toContain(
            '"fired: chunks overflow" (live session, ingestion trace, no model involved, preset `default-chunk-size`)',
        );
    });

    test('falls back to the scripted firing when the model recovered live, and says when none exists', () => {
        const live = report([collapsedEmbedder('clear', 'every row ranked')], 'live');
        const block = usesBlock(input(live));
        expect(block).toContain('"fired, severity 1.00: scripted evidence" (scripted, preset `collapsed-embedder`)');
        expect(block).toContain('no firing recorded yet for preset `default-chunk-size`');
    });

    test('the CI example counts recorded traces and firings on clean runs from the replay', () => {
        expect(usesBlock(input(null))).toContain(
            '`pnpm replay` scores 24 committed traces (`recorded`, `claude-haiku-5-5`) offline with no model or key: ' +
                '0 firings on 24 clean runs.',
        );
    });
});

describe('pitchBlock', () => {
    test('states the lead finding with numbers from the book repro only', () => {
        const block = pitchBlock(sampleHeadline(undefined).book.evidence);
        expect(block).toContain('a median 35.7% of each chunk is never embedded');
        expect(block).toContain('into the top 5 results 30.8% of the time, against 69.2% for a sentence from the head');
    });
});
