import { access } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

import { loadQuestions, type CorpusQuestion } from '../../src/corpus/index.ts';
import { demonstrationReportSchema, type DemonstrationReport } from '../../src/studio/demonstration/index.ts';
import { newestRecording, recordedReport, type RecordingKind } from '../demonstration/recorded-report.ts';
import { demonstrationResultFiles } from '../demonstration/result-files.ts';
import { readResultFile, type ReadResult } from './read-results.ts';

export type DemonstrationInputs = {
    readonly scripted: DemonstrationReport;
    /** `null` until the owner runs `pnpm demonstration:live`. */
    readonly live: DemonstrationReport | null;
};

const exists = (path: string): Promise<boolean> =>
    access(path).then(
        () => true,
        () => false,
    );

/** The newest recording of this kind scored offline, or `null` when none is committed yet. */
const traceBackedReport = async (
    kind: RecordingKind,
    corpus: readonly CorpusQuestion[],
): Promise<ReadResult<DemonstrationReport> | null> => {
    const directory = await newestRecording(kind);
    if (directory === null) {
        return null;
    }
    const scored = await recordedReport(directory, corpus);
    return scored.kind === 'scored'
        ? { kind: 'read', value: scored.report }
        : { kind: 'invalid', path: scored.directory, reason: scored.reason };
};

const resultFileReport = (kind: RecordingKind): Promise<ReadResult<DemonstrationReport>> =>
    readResultFile(pathToFileURL(demonstrationResultFiles[kind]), demonstrationReportSchema);

/**
 * Each matrix from its newest committed recording, scored offline, so the tables always match the stored traces;
 * without one, the committed result file. The live column falls back to the verdict-only `live.json` of a run made
 * before traces were recorded, and is `null` before any live run.
 */
export const readDemonstrationInputs = async (): Promise<ReadResult<DemonstrationInputs>> => {
    const corpus = await loadQuestions();
    if (corpus.kind === 'failed') {
        return { kind: 'invalid', path: 'data/hotpotqa/questions.jsonl', reason: JSON.stringify(corpus.failure) };
    }
    const scripted = (await traceBackedReport('scripted', corpus.questions)) ?? (await resultFileReport('scripted'));
    if (scripted.kind === 'invalid') {
        return scripted;
    }
    const live =
        (await traceBackedReport('live', corpus.questions)) ??
        ((await exists(demonstrationResultFiles.live)) ? await resultFileReport('live') : null);
    if (live?.kind === 'invalid') {
        return live;
    }
    return { kind: 'read', value: { scripted: scripted.value, live: live === null ? null : live.value } };
};
