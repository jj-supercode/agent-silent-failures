import { rateLine, rateOf, type BedReport, type Rate, type ReportProvenance } from '../bed/index.ts';
import type { EntryId } from '../entries/index.ts';
import type { FixtureManifest } from '../record/index.ts';
import type { ReplayProblem, ReplayResult } from './replay-fixtures.ts';

/** Every number replay prints names the model and the day its traces were recorded. */
export const replayProvenance = (manifest: FixtureManifest, source: ReportProvenance['source']): ReportProvenance => ({
    source,
    platform: `${manifest.platform.os} ${manifest.platform.arch}, Node ${manifest.platform.node} (recording)`,
    generatedOn: manifest.recordedOn,
    versions: {
        'agent model': manifest.models.agent,
        ...(manifest.models.judge === null ? {} : { 'judge model': manifest.models.judge }),
        ...manifest.versions,
    },
});

const modeMeaning = {
    live:
        "Traces from a real model run, recorded once and scored offline. Live runs keep each variation family's " +
        'retrieval settings (top K, chunking); the scripted phrasing and answer wording do not apply to a real model. ' +
        'A detector firing on a clean live run is either a false alarm or a real failure of the model: read its evidence.',
    'dry-run':
        'A dry run: the live pipeline (budget guard, recorder, sanitizer) driven by the scripted policies instead of a ' +
        'real model, so every number here is scripted and equals the bed for the same runs.',
} as const satisfies Record<FixtureManifest['mode'], string>;

/** The judge's verdicts as a rate, or `null` when the recording ran without a judge. */
const judgedCorrect = (result: ReplayResult): Rate | null =>
    result.judged.length === 0
        ? null
        : rateOf(result.judged.filter((judged) => judged.correct).length, result.judged.length);

const judgeLine = (manifest: FixtureManifest, result: ReplayResult): readonly string[] => {
    const rate = judgedCorrect(result);
    return rate === null ? [] : [`- ${rateLine(`judged correct by \`${manifest.models.judge ?? 'judge'}\``, rate)}`];
};

const problemLines = (title: string, problems: readonly ReplayProblem[]): readonly string[] =>
    problems.length === 0
        ? []
        : [
              '',
              `### ${title} (${problems.length})`,
              '',
              ...problems.map((problem) => `- \`${problem.runId}\`: ${problem.reason}`),
          ];

/** Entries no recorded run reproduces a fault of: their catch rates read 0/0 in a replay. */
export const entriesWithoutFaultRuns = (report: BedReport): readonly EntryId[] => [
    ...new Set(
        report.splits.flatMap((split) =>
            split.detectors.filter((detector) => detector.caught.trials === 0).map((detector) => detector.entryId),
        ),
    ),
];

const catchRateNote = (report: BedReport): readonly string[] => {
    const uncaught = entriesWithoutFaultRuns(report);
    return uncaught.length === 0
        ? []
        : [
              `- No recorded run reproduces a fault of ${uncaught.map((entryId) => `\`${entryId}\``).join(', ')}: ` +
                  "their faults replace the model's own behaviour, so they are not recorded and their catch rates read " +
                  '0/0 here. Those catch rates come from the scripted bed; a replay measures their false alarms.',
          ];
};

/** The replay preface: what was replayed, how many runs, the judge's verdicts, and every run that was not scored. */
export const renderReplayNotes = (
    manifest: FixtureManifest,
    result: ReplayResult,
    report: BedReport,
    fixtureName: string,
): string =>
    [
        `# Replay of \`${fixtureName}\``,
        '',
        modeMeaning[manifest.mode],
        '',
        `- Agent model: \`${manifest.models.agent}\`; recorded ${manifest.recordedOn} on ${manifest.platform.os} ${manifest.platform.arch}.`,
        `- Runs: ${manifest.plannedRuns} planned, ${manifest.recordedRuns} recorded, ${result.scored.length} scored, ` +
            `${result.failedWhileRecording.length} failed while recording, ${result.unscorable.length} unscorable.`,
        ...(manifest.stoppedEarly === null ? [] : [`- The recording stopped early: ${manifest.stoppedEarly}.`]),
        '- A recording holds agent runs only. Ingestion calls no model, so ingestion entries (embedding-coverage) are ' +
            'measured by the scripted bed alone: see `results/offline/report.md`.',
        ...catchRateNote(report),
        ...judgeLine(manifest, result),
        ...problemLines('Failed while recording', result.failedWhileRecording),
        ...problemLines('Unscorable', result.unscorable),
        '',
    ].join('\n');

/** The machine-readable preface: the fixture manifest and every run that did not reach the report. */
export const renderReplayJson = (manifest: FixtureManifest, result: ReplayResult, fixtureName: string): string =>
    `${JSON.stringify(
        {
            fixture: fixtureName,
            source: result.source,
            manifest,
            scoredRuns: result.scored.length,
            failedWhileRecording: result.failedWhileRecording,
            unscorable: result.unscorable,
            judgedCorrect: judgedCorrect(result),
        },
        null,
        4,
    )}\n`;
