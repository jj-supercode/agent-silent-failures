import { describe, expect, test } from 'vitest';

import { rateSchema } from '../../src/bed/index.ts';
import { faultIdSchema, severityIdSchema } from '../../src/catalog/index.ts';
import { entryIdSchema } from '../../src/entries/index.ts';
import type { DetectorReport, Rate, ReplaySummary, SplitReport } from './model.ts';
import { entriesTable, type EntrySummary } from './render-entries-table.ts';
import { defaultStackBlock } from './render-default-stack.ts';
import { headlineBlock, type HeadlineInput } from './render-headline.ts';
import { replayBlock } from './render-replay.ts';
import { reprosTable } from './render-repros-table.ts';
import { sampleHeadline, sampleReproReport } from './testing.ts';

/** A rate with a fixed interval, so expected text does not depend on the Wilson formula. */
const sampleRate = (events: number, trials: number): Rate =>
    rateSchema.parse({
        events,
        trials,
        share: events / trials,
        interval: { lower: 0.5, upper: 1, ruleOfThreeUpper: null },
    });

/** Every run expressed the fault: the catch over all runs equals the catch over expressed runs. */
const allExpressed = (caught: Rate) => ({
    caught,
    caughtWhenExpressed: caught,
    notExpressed: 0,
    firedWhenNotExpressed: 0,
});

const sampleDetector = (entryId: string): DetectorReport => ({
    entryId: entryIdSchema.parse(entryId),
    ...allExpressed(sampleRate(9, 10)),
    caughtBySeverity: [
        {
            faultId: faultIdSchema.parse('default-chunk-size'),
            severity: severityIdSchema.parse('mastra-defaults'),
            ...allExpressed(sampleRate(3, 4)),
        },
    ],
    falseAlarms: sampleRate(0, 20),
    falseAlarmsByVariation: [],
    notApplicableOnFaulted: 0,
});

const sampleSplit = (detectors: readonly DetectorReport[]): SplitReport => ({
    split: 'held-out',
    agentRuns: 1200,
    ingestions: 30,
    detectors: [...detectors],
    confusion: [],
    sensitivity: [],
    headline: [],
});

const sampleEntry = (id: string): EntrySummary => ({
    id: entryIdSchema.parse(id),
    title: id,
    kind: 'run',
    status: 'stable',
    summary: `What ${id} catches.`,
});

describe('entriesTable', () => {
    test('shows each entry with its held-out rates and links its page', () => {
        const table = entriesTable(
            [sampleEntry('flat-score')],
            sampleSplit([sampleDetector('flat-score')]),
            'scripted',
        );

        expect(table).toContain('[flat-score](src/entries/flat-score/README.md)');
        expect(table).toContain('9/10, 90.0% (50.0% to 100.0%)');
        expect(table).toContain('1,200 agent runs');
    });

    test('says an entry was not scored instead of printing zeros', () => {
        const table = entriesTable([sampleEntry('tool-loop')], sampleSplit([]), 'scripted');

        expect(table).toContain('not scored');
        expect(table).not.toContain('0/0');
    });
});

describe('headlineBlock', () => {
    test('quotes the measured shares and intervals and labels where they came from', () => {
        const block = headlineBlock(
            sampleHeadline({
                faultId: 'default-chunk-size',
                caught: sampleRate(3, 4),
                caughtWhenExpressed: sampleRate(3, 3),
                notExpressed: 1,
                firedWhenNotExpressed: 0,
            }),
        );

        expect(block).toContain('249 of 249 default chunks');
        expect(block).toContain('30.8% (95% CI 10.0% to 90.0%, n = 120)');
        expect(block).toContain('58 of 77');
        expect(block).toContain('ingestions caught 3/4, 75.0%');
        expect(block).toContain('not expressed: 1; caught when expressed 3/3, 100.0%');
        expect(block).toContain('Repro numbers: scripted (offline, no model)');
    });

    test('names runs where the canary fired although no truncation was observed', () => {
        const block = headlineBlock(
            sampleHeadline({
                faultId: 'default-chunk-size',
                caught: sampleRate(4, 4),
                caughtWhenExpressed: sampleRate(3, 3),
                notExpressed: 1,
                firedWhenNotExpressed: 1,
            }),
        );

        expect(block).toContain('fired although not expressed: 1');
    });

    test('derives the window in characters and the corpus boundary from the evidence, never from prose', () => {
        const block = headlineBlock(sampleHeadline(undefined));

        expect(block).toContain('At the 5.0 characters per token measured on the book below');
        expect(block).toContain('that window holds about 2,600 characters');
        expect(block).toContain('no document of 2,366 characters or fewer overflowed, and every document of 3,326');
        expect(block).toContain('chunked to 1,500 characters, 0 of the book');
        expect(block).not.toContain('2,000');
        expect(block).not.toContain('no query can retrieve');
    });

    test('states both lengths plainly when they do not separate the documents', () => {
        const input = sampleHeadline(undefined);
        const overlapping: HeadlineInput = {
            ...input,
            corpus: {
                ...input.corpus,
                evidence: {
                    ...input.corpus.evidence,
                    lengthBoundary: {
                        shortestDocumentWithAnOverflowingChunk: 2000,
                        longestDocumentWithoutOverflow: 2500,
                    },
                },
            },
        };

        expect(headlineBlock(overlapping)).toContain(
            'the shortest document with an overflowing chunk has 2,000 characters and the longest without one 2,500',
        );
    });

    test('labels each repro with its own provenance when they were generated apart', () => {
        const input = sampleHeadline(undefined);
        const regenerated: HeadlineInput = {
            ...input,
            memory: { ...input.memory, report: { ...input.memory.report, generatedOn: '2026-11-01' } },
        };

        expect(headlineBlock(regenerated)).toContain('memory-fastembed-truncation: scripted');
        expect(headlineBlock(input)).not.toContain('memory-fastembed-truncation: scripted');
    });

    test('never claims that every chunk is truncated', () => {
        expect(headlineBlock(sampleHeadline(undefined)).toLowerCase()).not.toContain('every chunk');
    });

    test('says so when the bed has no held-out ingestions of the default-stack fault', () => {
        expect(headlineBlock(sampleHeadline(undefined))).toContain('no held-out ingestions of the default-stack fault');
    });
});

describe('defaultStackBlock', () => {
    test('states the library defaults, the window and the corpus split from the repro reports, with their source', () => {
        const block = defaultStackBlock(sampleHeadline(undefined));

        expect(block).toContain('chunks to 4,000 characters (recursive, 200 overlap)');
        expect(block).toContain('embeds the first 512 tokens of each input, about 2,600 characters');
        expect(block).toContain('58 of 77 default chunks overflow');
        expect(block).toContain('give 0 of 386');
        expect(block).toContain('Source: `pnpm repros fastembed-truncation-hotpotqa fastembed-truncation`, scripted');
    });
});

describe('replayBlock', () => {
    const dryRun: ReplaySummary = {
        fixture: 'fixtures/dry-run/2026-10-14',
        source: 'scripted',
        manifest: {
            mode: 'dry-run',
            recordedOn: '2026-10-14',
            models: { agent: 'dry-run-scripted-policy', judge: null },
            platform: { os: 'linux 6.0', arch: 'x64', node: 'v24.15.0' },
            plannedRuns: 8,
            recordedRuns: 8,
            failedRuns: 0,
        },
        scoredRuns: 8,
        unscorable: [],
    };

    const replayReport = (detectors: readonly DetectorReport[]) => ({
        provenance: { source: 'scripted' as const, platform: 'linux x64', generatedOn: '2026-10-15', versions: {} },
        sources: ['scripted' as const],
        splits: [sampleSplit(detectors)],
    });

    test('labels a dry-run set as scripted, never as recorded', () => {
        const block = replayBlock({ summary: dryRun, report: replayReport([]), entries: [], inSample: false });

        expect(block).toContain('Source label: `scripted`');
        expect(block).toContain('a dry run of the recording pipeline');
        expect(block).not.toContain('in-sample');
    });

    test('labels the false alarms in-sample when detector rules were revised on the recording', () => {
        const block = replayBlock({
            summary: dryRun,
            report: replayReport([sampleDetector('flat-score')]),
            entries: [sampleEntry('flat-score')],
            inSample: true,
        });

        expect(block).toContain('False alarms on clean runs (in-sample)');
        expect(block).toContain('a new recording is the out-of-sample check');
    });

    test('names an ingestion entry the recording cannot score instead of silently dropping it', () => {
        const coverage: EntrySummary = { ...sampleEntry('embedding-coverage'), kind: 'ingestion' };
        const block = replayBlock({
            summary: dryRun,
            report: replayReport([sampleDetector('flat-score')]),
            entries: [sampleEntry('flat-score'), coverage],
            inSample: false,
        });

        expect(block).toContain('Not in this table: `embedding-coverage`, an ingestion entry');
    });

    test('says a fault has no recorded runs rather than printing an empty rate', () => {
        const toolLoop = {
            ...sampleDetector('tool-loop'),
            caught: rateSchema.parse({ events: 0, trials: 0, share: null, interval: null }),
        };

        const block = replayBlock({
            summary: dryRun,
            report: replayReport([toolLoop]),
            entries: [sampleEntry('tool-loop')],
            inSample: false,
        });

        expect(block).toContain('no recorded fault runs');
    });
});

describe('reprosTable', () => {
    test('marks a repro that stopped reproducing', () => {
        const table = reprosTable([sampleReproReport('early-trace-scoring', 'not-reproduced')]);

        expect(table).toContain('no longer reproduces');
        expect(table).toContain('../repros/early-trace-scoring/repro.ts');
    });
});
