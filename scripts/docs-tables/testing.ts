import { conditionLabel, rateOf } from '../../src/bed/index.ts';
import { variationIdSchema } from '../../src/catalog/index.ts';
import { entryIdSchema } from '../../src/entries/index.ts';
import type { BedReport, DetectorReport, Proportion, Rate, ReplaySummary, ReproReport, SplitReport } from './model.ts';
import type { HeadlineInput } from './render-headline.ts';
import type { EntrySummary } from './render-entries-table.ts';

/** Sample report parts for the docs-tables tests: only the fields a renderer reads are meaningful. */
export const noRunsSample: Rate = rateOf(0, 0);

export type DetectorSample = {
    readonly falseAlarms: Rate;
    readonly falseAlarmsByVariation?: DetectorReport['falseAlarmsByVariation'];
    readonly caught?: Rate;
};

export const sampleDetectorReport = (entryId: string, sample: DetectorSample): DetectorReport => ({
    entryId: entryIdSchema.parse(entryId),
    caught: sample.caught ?? noRunsSample,
    caughtWhenExpressed: sample.caught ?? noRunsSample,
    notExpressed: 0,
    firedWhenNotExpressed: 0,
    caughtBySeverity: [],
    notApplicableOnFaulted: 0,
    falseAlarms: sample.falseAlarms,
    falseAlarmsByVariation: [...(sample.falseAlarmsByVariation ?? [])],
});

export const sampleCleanRow = (variation: string, agentRuns: number, goldAnswerFound: Rate) => ({
    condition: conditionLabel({ kind: 'clean', variation: variationIdSchema.parse(variation), hardNegativeFor: [] }),
    agentRuns,
    firedByEntry: [],
    goldAnswerFound,
    meanGoldSentenceRecall: null,
});

/** A held-out split with a clean baseline row and a clean search-outage row whose gold rate is given. */
export const sampleHeldOutSplit = (detectors: readonly DetectorReport[], goldOnOutage: Rate): SplitReport => ({
    split: 'held-out',
    agentRuns: 24,
    ingestions: 0,
    detectors: [...detectors],
    confusion: [],
    sensitivity: [],
    headline: [sampleCleanRow('baseline', 12, rateOf(9, 12)), sampleCleanRow('search-outage', 12, goldOnOutage)],
});

export const sampleBedReport = (source: 'recorded' | 'scripted', heldOut: SplitReport): BedReport => ({
    provenance: { source, platform: 'darwin arm64', generatedOn: '2026-10-15', versions: {} },
    sources: [source],
    splits: [heldOut],
});

export const sampleReplaySummary = (fixture: string, source: 'recorded' | 'scripted'): ReplaySummary => ({
    fixture,
    source,
    manifest: {
        mode: source === 'recorded' ? 'live' : 'dry-run',
        recordedOn: '2026-10-15',
        models: { agent: 'claude-haiku-5-5', judge: null },
        platform: { os: 'darwin 25.6.0', arch: 'arm64', node: 'v24.22.0' },
        plannedRuns: 24,
        recordedRuns: 24,
        failedRuns: 0,
    },
    scoredRuns: 24,
    unscorable: [],
});

/** The clean search-outage variation as a hard negative, with its false alarms. */
export const sampleOutageVariation = (falseAlarms: Rate) => ({
    variation: variationIdSchema.parse('search-outage'),
    hardNegative: true,
    falseAlarms,
    notApplicable: 0,
});

export const sampleEntrySummary = (id: string, kind: EntrySummary['kind']): EntrySummary => ({
    id: entryIdSchema.parse(id),
    title: id,
    kind,
    status: 'stable',
    summary: id,
});

export const sampleReproReport = (reproductionId: string, outcome: ReproReport['outcome']): ReproReport => ({
    reproductionId,
    outcome,
    summary: `${reproductionId} summary`,
    source: 'scripted',
    platform: 'linux 6.0 x64, Node v24.15.0',
    generatedOn: '2026-10-15',
    versions: { '@mastra/core': '1.77.0' },
    evidence: {},
});

export const sampleProportion = (successes: number, trials: number): Proportion => ({
    successes,
    trials,
    rate: successes / trials,
    low: 0.1,
    high: 0.9,
});

export const sampleDistribution = (median: number) => ({ count: 10, min: 1, median, max: median * 2, mean: median });

/** The three headline repros with the committed shapes and round sample values. */
export const sampleHeadline = (defaultStackCatch: HeadlineInput['defaultStackCatch']): HeadlineInput => ({
    book: {
        report: sampleReproReport('fastembed-truncation', 'reproduces'),
        evidence: {
            corpusCharacters: 949181,
            window: { tokens: 512, contentTokens: 510 },
            defaultChunks: {
                count: 249,
                characters: sampleDistribution(4000),
                bgeContentTokens: sampleDistribution(800),
                overflowingCount: 249,
                neverEmbeddedCharacterShareOfCorpus: 0.36,
                neverEmbeddedCharacterShareOfOverflowingChunk: sampleDistribution(0.357),
            },
            cutPointCheck: { cosineFullChunkVsPrefixPlusUnrelatedTail: 1 },
            fittingControl: {
                maxSize: 1500,
                count: 713,
                bgeContentTokens: sampleDistribution(293),
                overflowingCount: 0,
            },
            retrieval: {
                topK: 5,
                defaultChunksHeadSentences: { hitAtTopK: sampleProportion(83, 120) },
                defaultChunksTailSentences: { hitAtTopK: sampleProportion(37, 120) },
                fittingChunksSameTailSentences: { hitAtTopK: sampleProportion(100, 120) },
            },
        },
    },
    corpus: {
        report: sampleReproReport('fastembed-truncation-hotpotqa', 'reproduces'),
        evidence: {
            questionLevel: {
                documentCharacters: sampleDistribution(6083),
                defaultChunks: {
                    chunkCount: 77,
                    overflowingCount: 58,
                    tokensBeyondWindowShare: 0.2788,
                    bgeContentTokens: sampleDistribution(701),
                },
            },
            paragraphLevel: {
                documentCharacters: sampleDistribution(491),
                defaultChunks: {
                    chunkCount: 386,
                    overflowingCount: 0,
                    tokensBeyondWindowShare: 0,
                    bgeContentTokens: sampleDistribution(108),
                },
            },
            lengthBoundary: { shortestDocumentWithAnOverflowingChunk: 3326, longestDocumentWithoutOverflow: 2366 },
        },
    },
    memory: {
        report: sampleReproReport('memory-fastembed-truncation', 'reproduces'),
        evidence: {
            recallTopK: 3,
            queriesFromEmbeddedRegion: sampleProportion(32, 39),
            queriesFromNeverEmbeddedRegion: sampleProportion(14, 38),
        },
    },
    defaultStackCatch,
    bedProvenance: 'scripted, linux x64',
});
