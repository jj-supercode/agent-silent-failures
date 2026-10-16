import { fileURLToPath } from 'node:url';

import {
    countText,
    displayPath,
    usdText,
    type CommandFailure,
    type CommandHeader,
    type CommandReport,
} from '../../src/command-output/index.ts';
import { usdSchema, type Usd } from '../../src/live/budget/model.ts';
import { maxUsdVariable } from '../../src/live/studio/studio-live-options.ts';
import {
    demonstrationQuestionCount,
    type DemonstrationReport,
    type DemonstrationSpend,
} from '../../src/studio/demonstration/index.ts';
import { studioFaultPresetList, type StudioFaultId } from '../../src/studio/index.ts';
import { demonstrationLiveExitCodes, type DemonstrationLiveOptions } from './live-command.ts';
import { firedPresetCount, matrixCounts, matrixRateFacts } from './matrix-report.ts';
import type { ReadyMatrixModel } from './matrix-model.ts';
import { demonstrationResultFiles } from './result-files.ts';

// What `pnpm demonstration:live` says: its header, its refusals and warnings, and its closing report.

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

const liveCapablePresets = studioFaultPresetList.filter((preset) => preset.live.kind === 'live-capable');

/** A paid recording stands either way: the difference is a sanitizer defect to fix, then `--rescore`. */
export const differencesWarning =
    "the recorded traces score differently from Studio's trace scoring on these presets; the recording is kept, " +
    'fix the sanitizer and run pnpm demonstration --rescore';

export const existingRecordingFailure = (directory: string): CommandFailure => ({
    subject: displayPath(repositoryRoot, directory),
    what: 'a recording already exists there; nothing was sent',
    why: 'a live recording is paid for and is never overwritten',
    fix: 'name another directory with --fixtures <dir>, or move the existing recording first',
});

/** As in `pnpm demo:live`: a dry run bills nothing, so its estimate is a count, never spend. */
export const billedUsd = (options: DemonstrationLiveOptions, usd: Usd): Usd | null =>
    options.mode === 'dry-run' ? null : usd;

const spendCounts = (
    options: DemonstrationLiveOptions,
    spend: DemonstrationSpend,
): Readonly<Record<string, number>> => ({
    modelCalls: spend.modelCalls,
    ...(options.mode === 'dry-run' ? { estimatedSpendUsd: spend.usd } : {}),
});

export const liveMatrixHeader = (
    options: DemonstrationLiveOptions,
    model: ReadyMatrixModel,
    directory: string,
): CommandHeader => ({
    title: `agent-silent-failures demonstration${options.mode === 'dry-run' ? ' (dry run)' : ''}`,
    description:
        `${countText(liveCapablePresets.length)} live-capable Studio fault presets of ` +
        `${countText(studioFaultPresetList.length)}, ${demonstrationQuestionCount} held-out questions each ` +
        '(ingestion presets ask none); the scripted-only preset is recorded as not run.',
    measures: 'per preset, the traces its entry fired on; a model that recovers is a correct clear, not a miss',
    total: studioFaultPresetList.length,
    unit: 'presets',
    facts: [
        ['model', model.agentModel],
        [
            'spendCap',
            `${usdText(model.cap)} (set ${maxUsdVariable} to change it); a call that could cross it is refused and ` +
                'its run is recorded as failed',
        ],
        ['recording', displayPath(repositoryRoot, directory)],
    ],
});

export type LiveMatrix = {
    readonly options: DemonstrationLiveOptions;
    readonly report: DemonstrationReport;
    readonly differences: readonly StudioFaultId[];
    readonly spend: DemonstrationSpend;
    readonly directory: string;
    /** The matrix file written, or `null` for a dry run without `--out`. */
    readonly matrixFile: string | null;
};

/** The closing report: a preset that did not fire live is a reported clear, never a failure of the command. */
export const liveMatrixReport = ({
    options,
    report,
    differences,
    spend,
    directory,
    matrixFile,
}: LiveMatrix): CommandReport => ({
    exit: demonstrationLiveExitCodes.done,
    headline: `${countText(firedPresetCount(report))} of ${countText(report.presets.length)} presets fired their entry`,
    counts: { ...matrixCounts(report), ...spendCounts(options, spend), scoringDifferences: differences.length },
    rates: matrixRateFacts(report),
    spendUsd: billedUsd(options, usdSchema.parse(spend.usd)),
    outputs: [directory, ...(matrixFile === null ? [] : [matrixFile])].map((file) => displayPath(repositoryRoot, file)),
    next:
        matrixFile === demonstrationResultFiles.live
            ? [{ command: 'pnpm docs:tables', purpose: 'fill the README "Live" column' }]
            : [],
});
