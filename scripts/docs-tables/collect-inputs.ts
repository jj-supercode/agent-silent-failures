import { fileURLToPath } from 'node:url';

import type { z } from 'zod';

import { storedBedReportSchema } from '../../src/bed/index.ts';
import { loadQuestions } from '../../src/corpus/index.ts';
import { readFixtureSet } from '../../src/record/index.ts';
import {
    bookTruncationEvidenceSchema,
    corpusTruncationEvidenceSchema,
    memoryTruncationEvidenceSchema,
    replaySummarySchema,
    type BedReport,
    type ReplaySummary,
    type ReproReport,
} from './model.ts';
import { readReproReports, readResultFile, reproEvidence, resultsDirectory, type ReadResult } from './read-results.ts';
import { readDemonstrationInputs, type DemonstrationInputs } from './demonstration-inputs.ts';
import { outageAnswers, type OutageAnswers } from './outage-answers.ts';
import type { HeadlineInput } from './render-headline.ts';

/** Everything the generated blocks quote, read from the committed result files. */
export type DocsInputs = {
    readonly offline: BedReport;
    readonly replaySummary: ReplaySummary;
    readonly replayReport: BedReport;
    /** The first scoring of the recording, frozen in `results/replay/first-scoring/`. */
    readonly firstScoringSummary: ReplaySummary;
    readonly firstScoringReport: BedReport;
    /** The scripted bed report at the time of the first scoring, frozen beside it. */
    readonly firstScoringOffline: BedReport;
    /** How the recorded answers behaved under a search outage, read from the replayed set's traces. */
    readonly outageAnswers: readonly OutageAnswers[];
    readonly repros: readonly ReproReport[];
    readonly headlineRepros: Pick<HeadlineInput, 'book' | 'corpus' | 'memory'>;
    /** The Studio fault presets, driven scripted and (once the owner ran it) live. */
    readonly demonstration: DemonstrationInputs;
};

const headlineReproIds = {
    book: 'fastembed-truncation',
    corpus: 'fastembed-truncation-hotpotqa',
    memory: 'memory-fastembed-truncation',
} as const;

const missingRepro = (reproductionId: string): ReadResult<never> => ({
    kind: 'invalid',
    path: `results/repros/${reproductionId}.json`,
    reason: 'no report: run `pnpm repros` first',
});

const findRepro = (repros: readonly ReproReport[], reproductionId: string): ReadResult<ReproReport> => {
    const report = repros.find((candidate) => candidate.reproductionId === reproductionId);
    return report === undefined ? missingRepro(reproductionId) : { kind: 'read', value: report };
};

const quotedRepro = <TSchema extends z.ZodType>(
    repros: readonly ReproReport[],
    reproductionId: string,
    schema: TSchema,
): ReadResult<{ readonly report: ReproReport; readonly evidence: z.infer<TSchema> }> => {
    const found = findRepro(repros, reproductionId);
    return found.kind === 'invalid' ? found : reproEvidence(found.value, schema);
};

const headlineEvidence = (repros: readonly ReproReport[]): ReadResult<DocsInputs['headlineRepros']> => {
    const book = quotedRepro(repros, headlineReproIds.book, bookTruncationEvidenceSchema);
    const corpus = quotedRepro(repros, headlineReproIds.corpus, corpusTruncationEvidenceSchema);
    const memory = quotedRepro(repros, headlineReproIds.memory, memoryTruncationEvidenceSchema);
    if (book.kind === 'invalid') return book;
    if (corpus.kind === 'invalid') return corpus;
    if (memory.kind === 'invalid') return memory;
    return { kind: 'read', value: { book: book.value, corpus: corpus.value, memory: memory.value } };
};

const repositoryRoot = new URL('../../', import.meta.url);

/** Reads the fixture set a replay summary names and tallies its outage answers. */
const recordedOutageAnswers = async (fixture: string): Promise<ReadResult<readonly OutageAnswers[]>> => {
    const [fixtures, corpus] = await Promise.all([
        readFixtureSet(fileURLToPath(new URL(fixture, repositoryRoot))),
        loadQuestions(),
    ]);
    if (fixtures.kind === 'invalid') {
        return { kind: 'invalid', path: fixtures.directory, reason: fixtures.reason };
    }
    if (corpus.kind === 'failed') {
        return { kind: 'invalid', path: 'data/hotpotqa/questions.jsonl', reason: JSON.stringify(corpus.failure) };
    }
    return { kind: 'read', value: outageAnswers(fixtures.fixtures, corpus.questions) };
};

export const collectInputs = async (): Promise<ReadResult<DocsInputs>> => {
    const [offline, replaySummary, replayReport, firstScoringSummary, firstScoringReport, firstScoringOffline, repros] =
        await Promise.all([
            readResultFile(new URL('offline/report.json', resultsDirectory), storedBedReportSchema),
            readResultFile(new URL('replay/replay.json', resultsDirectory), replaySummarySchema),
            readResultFile(new URL('replay/report.json', resultsDirectory), storedBedReportSchema),
            readResultFile(new URL('replay/first-scoring/replay.json', resultsDirectory), replaySummarySchema),
            readResultFile(new URL('replay/first-scoring/report.json', resultsDirectory), storedBedReportSchema),
            readResultFile(
                new URL('replay/first-scoring/offline-report.json', resultsDirectory),
                storedBedReportSchema,
            ),
            readReproReports(),
        ]);
    if (offline.kind === 'invalid') return offline;
    if (replaySummary.kind === 'invalid') return replaySummary;
    if (replayReport.kind === 'invalid') return replayReport;
    if (firstScoringSummary.kind === 'invalid') return firstScoringSummary;
    if (firstScoringReport.kind === 'invalid') return firstScoringReport;
    if (firstScoringOffline.kind === 'invalid') return firstScoringOffline;
    const outages = await recordedOutageAnswers(replaySummary.value.fixture);
    if (outages.kind === 'invalid') return outages;
    if (repros.kind === 'invalid') return repros;
    const headlineRepros = headlineEvidence(repros.value);
    if (headlineRepros.kind === 'invalid') return headlineRepros;
    const demonstration = await readDemonstrationInputs();
    if (demonstration.kind === 'invalid') return demonstration;
    return {
        kind: 'read',
        value: {
            offline: offline.value,
            replaySummary: replaySummary.value,
            replayReport: replayReport.value,
            firstScoringSummary: firstScoringSummary.value,
            firstScoringReport: firstScoringReport.value,
            firstScoringOffline: firstScoringOffline.value,
            outageAnswers: outages.value,
            repros: repros.value,
            headlineRepros: headlineRepros.value,
            demonstration: demonstration.value,
        },
    };
};
