import { ingestionEntryItems } from '../catalog/index.ts';
import {
    countText,
    countedText,
    type CommandHeader,
    type CommandOutput,
    type CommandReport,
} from '../command-output/index.ts';
import { detectorRateFacts, type BedReport } from '../bed/index.ts';
import type { FixtureManifest } from '../record/index.ts';
import { replayExitCodes } from './replay-command.ts';
import type { ReplayResult } from './replay-fixtures.ts';
import type { ReplayOptions } from './replay-options.ts';
import { entriesWithoutFaultRuns } from './replay-report.ts';

// What `pnpm replay` says about a replay: header facts, problems, scope notes and the closing report.

/** Ingestion entries never appear in a recording: ingestion calls no model. */
const ingestionEntryIds = ingestionEntryItems.map((item) => item.entry.id);

const recordingFact = (manifest: FixtureManifest): string =>
    `${manifest.models.agent}, recorded ${manifest.recordedOn} on ${manifest.platform.os} ${manifest.platform.arch}` +
    (manifest.mode === 'dry-run' ? ' (dry run: scripted policies, numbers are scripted)' : '');

const runsFact = (manifest: FixtureManifest): string =>
    `${countText(manifest.plannedRuns)} planned, ${countText(manifest.recordedRuns)} recorded, ` +
    `${countText(manifest.failedRuns)} failed while recording` +
    (manifest.stoppedEarly === null ? '' : `; stopped early: ${manifest.stoppedEarly}`);

/** Unscorable runs are failures; runs that failed while recording were never scored as clear, and say so once. */
export const reportProblems = (result: ReplayResult, output: CommandOutput): void => {
    result.unscorable.forEach((problem) =>
        output.failure({ subject: problem.runId, what: 'recorded run not scorable', why: problem.reason, fix: null }),
    );
    if (result.failedWhileRecording.length > 0) {
        output.warning(
            `${result.failedWhileRecording.length} runs failed while recording; they are left out of every rate`,
            result.failedWhileRecording.map((problem) => `${problem.runId}: ${problem.reason}`),
        );
    }
};

export const scopeNotes = (report: BedReport): readonly string[] => {
    const uncaught = entriesWithoutFaultRuns(report);
    return [
        `${ingestionEntryIds.join(', ')}: scored on ingestions, which call no model; the rates come from pnpm bed.`,
        ...(uncaught.length === 0
            ? []
            : [
                  `No recorded fault runs for ${uncaught.join(', ')}: their faults replace the model, so their ` +
                      'catch rates come from pnpm bed; a replay measures their false alarms.',
              ]),
    ];
};

export const replayHeader = (fixtureName: string, manifest: FixtureManifest): CommandHeader => ({
    title: 'agent-silent-failures replay',
    description: `Scores the recorded runs of ${fixtureName} offline, with the same detectors as the bed.`,
    measures: 'per detector, false alarms on recorded clean runs and catches on recorded fault runs',
    total: manifest.recordedRuns,
    unit: 'runs',
    facts: [
        ['recording', recordingFact(manifest)],
        ['runs', runsFact(manifest)],
    ],
});

export type ReplayFacts = {
    readonly options: ReplayOptions;
    readonly manifest: FixtureManifest;
    readonly result: ReplayResult;
    readonly report: BedReport;
    readonly outputs: readonly string[];
};

/** The closing report: counts, exact rates, the files written and what to run next. */
export const replayReport = ({ options, manifest, result, report, outputs }: ReplayFacts): CommandReport => ({
    exit: result.unscorable.length === 0 ? replayExitCodes.allScored : replayExitCodes.unscorable,
    headline: `${countedText(result.scored.length, 'recorded run')} scored, ${countText(result.unscorable.length)} unscorable`,
    counts: {
        plannedRuns: manifest.plannedRuns,
        recordedRuns: manifest.recordedRuns,
        scoredRuns: result.scored.length,
        failedWhileRecording: result.failedWhileRecording.length,
        unscorableRuns: result.unscorable.length,
    },
    rates: detectorRateFacts(report),
    spendUsd: null,
    outputs,
    next: [
        { command: 'pnpm docs:tables', purpose: 'render the README tables from these reports' },
        ...(options.details
            ? []
            : [{ command: 'pnpm replay --details', purpose: 'the replay notes and every variation' }]),
    ],
});
