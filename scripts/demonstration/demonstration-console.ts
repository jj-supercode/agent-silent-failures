import { fileURLToPath } from 'node:url';

import {
    countText,
    displayPath,
    type CommandFailure,
    type CommandHeader,
    type CommandReport,
} from '../../src/command-output/index.ts';
import { demonstrationQuestionCount, type DemonstrationReport } from '../../src/studio/demonstration/index.ts';
import { studioFaultPresetList, type StudioFaultId } from '../../src/studio/index.ts';
import { demonstrationExitCodes, type RecordingAction } from './demonstration-command.ts';
import { firedPresetCount, matrixCounts, matrixRateFacts, scriptedMatrixExit } from './matrix-report.ts';
import type { RecordedReport } from './recorded-report.ts';
import { demonstrationResultFiles } from './result-files.ts';

// What both demonstration commands say: the scripted command's header and report, and the failures they share.

const repositoryRoot = fileURLToPath(new URL('../../', import.meta.url));

export const differenceFailure = (preset: StudioFaultId): CommandFailure => ({
    subject: preset,
    what: "the recorded traces score differently from Studio's trace scoring",
    why: 'the sanitized fixture lost something a detector reads, or a run changed between scoring and recording',
    fix: 'compare the preset in the report with Studio; the sanitizer keeps only the fields listed in fixtures/README.md',
});

export const unreadableFailure = (unreadable: Extract<RecordedReport, { kind: 'unreadable' }>): CommandFailure => ({
    subject: unreadable.directory,
    what: 'cannot score the demonstration recording',
    why: unreadable.reason,
    fix: 'record it again with pnpm demonstration (scripted) or pnpm demonstration:live',
});

export const docsFailure = (reason: string): CommandFailure => ({
    subject: null,
    what: 'cannot render the docs from the new results',
    why: reason,
    fix: 'run pnpm docs:tables and pnpm docs:charts, which report what they cannot read',
});

/** What `pnpm docs:tables` and `pnpm docs:charts` render from `results/`, which a writing run brings up to date. */
const renderedDocs = [
    'README.md',
    'docs/findings-in-mastra.md',
    'src/entries/*/README.md',
    'docs/images/charts/',
] as const;

const recordingFact = (directory: string, action: RecordingAction): string =>
    action === 'write'
        ? displayPath(repositoryRoot, directory)
        : `${displayPath(repositoryRoot, directory)} (a rehearsal: nothing in the repository is written)`;

export const scriptedHeader = (directory: string, action: RecordingAction): CommandHeader => ({
    title: 'agent-silent-failures demonstration',
    description:
        `${countText(studioFaultPresetList.length)} Studio fault presets, ${demonstrationQuestionCount} held-out ` +
        'questions each (ingestion presets read the ingestion), through the scripted Studio agents.',
    measures:
        'per preset, the traces its entry fired on, scored offline from the recorded traces and checked against ' +
        "Studio's trace scoring",
    total: studioFaultPresetList.length,
    unit: 'presets',
    facts: [
        ['stack', 'scripted model, local embeddings, in-memory LibSQL; offline, no key'],
        ['recording', recordingFact(directory, action)],
    ],
});

export type ScriptedMatrix = {
    readonly report: DemonstrationReport;
    readonly differences: readonly StudioFaultId[];
    readonly directory: string;
    readonly action: RecordingAction;
};

const writtenFiles = ({ directory, action }: ScriptedMatrix): readonly string[] =>
    action === 'write'
        ? [
              ...[directory, demonstrationResultFiles.scripted].map((file) => displayPath(repositoryRoot, file)),
              ...renderedDocs,
          ]
        : [displayPath(repositoryRoot, directory)];

/** The closing report of a scripted recording: a scoring difference outranks a preset that did not fire. */
export const scriptedMatrixReport = (matrix: ScriptedMatrix): CommandReport => {
    const { report, differences, action } = matrix;
    return {
        exit: differences.length > 0 ? demonstrationExitCodes.scoringDiffers : scriptedMatrixExit(report),
        headline: `${countText(firedPresetCount(report))} of ${countText(report.presets.length)} presets fired their entry`,
        counts: { ...matrixCounts(report), scoringDifferences: differences.length },
        rates: matrixRateFacts(report),
        spendUsd: null,
        outputs: writtenFiles(matrix),
        next: [
            ...(action === 'rehearse'
                ? [{ command: 'pnpm demonstration --write', purpose: 'replace the committed scripted recording' }]
                : []),
            { command: 'pnpm demonstration --rescore', purpose: 'score the committed recordings again, no agents' },
            {
                command: 'pnpm studio --fault <preset>',
                purpose: 'watch one preset in Studio; --list-faults lists them',
            },
        ],
    };
};
