import { rateOf } from '../../src/bed/index.ts';
import type { ExitCode, RateFact } from '../../src/command-output/index.ts';
import {
    presetVerdict,
    type DemonstrationReport,
    type PresetDemonstration,
} from '../../src/studio/demonstration/index.ts';
import { demonstrationExitCodes } from './demonstration-command.ts';

const tracesOf = (presetRun: PresetDemonstration) => (presetRun.kind === 'ran' ? presetRun.traces : []);

/** Presets whose expected entry fired on at least one of their traces. */
export const firedPresetCount = (report: DemonstrationReport): number =>
    report.presets.filter((presetRun) => presetVerdict(presetRun).kind === 'fired').length;

/** A scripted matrix succeeds when every preset's entry fired. */
export const scriptedMatrixExit = (report: DemonstrationReport): ExitCode =>
    firedPresetCount(report) === report.presets.length
        ? demonstrationExitCodes.allFired
        : demonstrationExitCodes.notAllFired;

export const matrixCounts = (report: DemonstrationReport): Readonly<Record<string, number>> => {
    const traces = report.presets.flatMap(tracesOf);
    return {
        presets: report.presets.length,
        firedPresets: firedPresetCount(report),
        notRunPresets: report.presets.filter((presetRun) => presetRun.kind === 'not-run').length,
        traces: traces.length,
        failedRuns: traces.filter((trace) => trace.kind === 'run-failed').length,
    };
};

/** Per preset, the share of its traces on which its expected entry fired, for `--json`. */
export const matrixRateFacts = (report: DemonstrationReport): readonly RateFact[] =>
    report.presets.flatMap((presetRun) => {
        const verdict = presetVerdict(presetRun);
        if (verdict.kind === 'not-run') {
            return [];
        }
        const rate = rateOf(verdict.kind === 'fired' ? verdict.fired : 0, verdict.traces);
        return [
            {
                group: null,
                subject: presetRun.preset,
                measure: `${presetRun.expectedEntry} fired`,
                events: rate.events,
                trials: rate.trials,
                share: rate.share,
                interval: rate.interval === null ? null : { lower: rate.interval.lower, upper: rate.interval.upper },
            },
        ];
    });
