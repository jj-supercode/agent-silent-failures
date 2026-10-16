import type { RunSpec } from '../../bed/index.ts';
import type { ManifestBase } from '../../record/index.ts';
import { manifestBaseOf, sessionBeforeHistory } from '../fixture-manifest.ts';
import { selectLiveRuns } from '../live-plan.ts';
import type { RecordingHistory } from '../session-files.ts';
import { spendStateOf } from '../spend-summary.ts';
import { readRecordingToResume, type RecordingToResume } from './recording-to-resume.ts';
import { identityMismatches, runsToResume, type RecordingIdentity } from './resume-check.ts';

export type ResumePreparation =
    | {
          readonly kind: 'ready';
          readonly recording: RecordingToResume;
          readonly manifestBase: ManifestBase;
          /** The planned runs with no completed line: failed or never recorded. */
          readonly runs: readonly RunSpec[];
          readonly history: RecordingHistory;
      }
    | { readonly kind: 'complete'; readonly completedRuns: number }
    | { readonly kind: 'refused'; readonly reason: string };

const historyOf = ({ manifest, completedLines, spend }: RecordingToResume): RecordingHistory => ({
    completedRuns: completedLines.length,
    sessions: manifest.sessions ?? [sessionBeforeHistory(manifest, spend.spentUsd)],
    spend: spendStateOf(spend),
    retriedRuns: spend.retriedRuns,
});

/**
 * Decides what a `--resume` session records, without writing anything: the recording must match this checkout
 * (mode, corpus, models, split, traced package versions) and the plan it was recorded from, re-derived from its
 * planned size. Refusals and a recording with nothing left to do leave the directory untouched.
 */
export const prepareResume = async (
    directory: string,
    specs: readonly RunSpec[],
    current: RecordingIdentity,
): Promise<ResumePreparation> => {
    const read = await readRecordingToResume(directory);
    if (read.kind === 'invalid') {
        return { kind: 'refused', reason: read.reason };
    }
    const { recording } = read;
    const { manifest, spend, completedLines } = recording;
    const mismatches = identityMismatches(manifest, current);
    if (mismatches.length > 0) {
        return { kind: 'refused', reason: `the recording does not match this checkout: ${mismatches.join('; ')}` };
    }
    if (spend.mode !== manifest.mode) {
        return { kind: 'refused', reason: `spend.json is a ${spend.mode} summary for a ${manifest.mode} recording` };
    }
    const planned = selectLiveRuns(specs, manifest.plannedRuns).runs;
    if (planned.length !== manifest.plannedRuns) {
        return {
            kind: 'refused',
            reason: `the recording planned ${manifest.plannedRuns} runs, the current plan holds ${planned.length}`,
        };
    }
    const selection = runsToResume(
        planned,
        completedLines.map((line) => line.runId),
    );
    if (selection.kind === 'foreign-runs') {
        return {
            kind: 'refused',
            reason: `${selection.runIds.length} recorded runs are not in the current plan (first: ${selection.runIds[0]})`,
        };
    }
    return selection.runs.length === 0
        ? { kind: 'complete', completedRuns: completedLines.length }
        : {
              kind: 'ready',
              recording,
              manifestBase: manifestBaseOf(manifest),
              runs: selection.runs,
              history: historyOf(recording),
          };
};
