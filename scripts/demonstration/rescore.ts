import { fileURLToPath } from 'node:url';

import {
    countedText,
    displayPath,
    stoppedReport,
    type CommandOutput,
    type CommandReport,
} from '../../src/command-output/index.ts';
import type { CorpusQuestion } from '../../src/corpus/index.ts';
import { demonstrationSummaryLines, type DemonstrationReport } from '../../src/studio/demonstration/index.ts';
import { demonstrationExitCodes } from './demonstration-command.ts';
import { matrixCounts, matrixRateFacts, scriptedMatrixExit } from './matrix-report.ts';
import { unreadableFailure } from './demonstration-console.ts';
import { newestRecording, recordedReport, type RecordingKind } from './recorded-report.ts';
import { demonstrationResultFiles, writeDemonstrationReport } from './result-files.ts';

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

type Rescored =
    | { readonly kind: 'rescored'; readonly report: DemonstrationReport }
    | { readonly kind: 'no-recording' }
    | { readonly kind: 'failed' };

/** Scores the newest recording of one kind and rewrites its result file; a failure is reported, never thrown. */
const rescore = async (
    kind: RecordingKind,
    corpus: readonly CorpusQuestion[],
    output: CommandOutput,
): Promise<Rescored> => {
    const directory = await newestRecording(kind);
    if (directory === null) {
        return { kind: 'no-recording' };
    }
    const scored = await recordedReport(directory, corpus);
    if (scored.kind === 'unreadable') {
        output.failure(unreadableFailure(scored));
        return { kind: 'failed' };
    }
    await writeDemonstrationReport(demonstrationResultFiles[kind], scored.report);
    output.section(
        `${kind === 'scripted' ? 'Scripted' : 'Live'}: ${displayPath(repositoryRoot, directory)}`,
        demonstrationSummaryLines(scored.report),
    );
    return { kind: 'rescored', report: scored.report };
};

const noScriptedRecording = {
    subject: null,
    what: 'no scripted demonstration recording to re-score',
    why: 'fixtures/demonstration/scripted/ holds no fixture set',
    fix: 'record one with pnpm demonstration',
} as const;

/** The live column before its first trace-backed recording stays the verdict-only file the owner committed. */
const noLiveRecordingNote =
    'no live recording under fixtures/demonstration/live/ yet: results/demonstration/live.json is left as it is';

/**
 * `pnpm demonstration --rescore`: scores the newest committed scripted and live recordings again, offline, and
 * rewrites `results/demonstration/{scripted,live}.json` from them; the entry point then re-renders the docs. No agent
 * runs and no model is called.
 */
export const rescoreRecordings = async (
    corpus: readonly CorpusQuestion[],
    output: CommandOutput,
): Promise<CommandReport> => {
    output.start({
        title: 'agent-silent-failures demonstration (re-score)',
        description: 'Scores the newest committed demonstration recordings again, offline: no agents, no model.',
        measures: 'per preset, the recorded traces its entry fired on',
        total: null,
        unit: null,
        facts: [],
    });
    const scripted = await rescore('scripted', corpus, output);
    if (scripted.kind === 'no-recording') {
        output.failure(noScriptedRecording);
    }
    const live = await rescore('live', corpus, output);
    if (live.kind === 'no-recording') {
        output.warning(noLiveRecordingNote, []);
    }
    if (scripted.kind !== 'rescored' || live.kind === 'failed') {
        return stoppedReport(demonstrationExitCodes.noRecording, 'a recording could not be re-scored');
    }
    const rescored = [scripted.report, ...(live.kind === 'rescored' ? [live.report] : [])];
    return {
        exit: scriptedMatrixExit(scripted.report),
        headline: `re-scored ${countedText(rescored.length, 'recording')} from the recorded traces`,
        counts: { ...matrixCounts(scripted.report), recordings: rescored.length },
        rates: matrixRateFacts(scripted.report),
        spendUsd: null,
        outputs: (live.kind === 'rescored'
            ? [demonstrationResultFiles.scripted, demonstrationResultFiles.live]
            : [demonstrationResultFiles.scripted]
        ).map((file) => displayPath(repositoryRoot, file)),
        next: [],
    };
};
