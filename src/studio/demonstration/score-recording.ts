import type { EntryVerdict, ScoredRun } from '../../bed/index.ts';
import { harnessRunViewOptions, ingestionEntryItems, runEntryItems } from '../../catalog/index.ts';
import type { CorpusQuestion, QuestionId } from '../../corpus/index.ts';
import { verdictReason } from '../../entries/verdict-reason.ts';
import type { FixtureSet, RecordedRun } from '../../record/index.ts';
import { replayProvenance, replayRecordedRun, sourceOf } from '../../replay/index.ts';
import { toRunView, type SpanRecord } from '../../trace/index.ts';
import { presetAvailability } from '../faults/preset-availability.ts';
import { studioFaultPresetList } from '../faults/presets.ts';
import type { StudioFaultPreset } from '../faults/model.ts';
import type {
    DemonstrationReport,
    DemonstrationSpend,
    DemonstrationTrace,
    EntryOutcome,
    PresetDemonstration,
} from './model.ts';
import { demonstrationQuestions } from './questions.ts';
import { presetOfHarnessKey } from './recording-labels.ts';

/** A demonstration's committed fixture set, with its spend summary and the name its report cites. */
export type DemonstrationRecording = {
    readonly fixtures: FixtureSet;
    /** `spend.json`; a scripted recording spends nothing and has none. */
    readonly spend: DemonstrationSpend | null;
    /** The fixture directory as the report names it: repo-relative inside the repository. */
    readonly name: string;
};

/** A verdict as Studio's trace scoring reports it: a not-applicable verdict is not scorable, with its reason. */
const entryOutcome = ({ entryId, verdict }: EntryVerdict): EntryOutcome =>
    verdict.kind === 'not-applicable'
        ? { entryId, kind: 'not-scorable', reason: verdict.reason }
        : { entryId, kind: verdict.kind, reason: verdictReason(verdict) };

/** A trace the bed's scoring could not read: every entry that applies to it reports it as not scorable. */
const unscorableOutcomes = (run: RecordedRun, reason: string): readonly EntryOutcome[] =>
    (run.labels.observation === 'ingestion' ? ingestionEntryItems : runEntryItems).map(({ entry }) => ({
        entryId: entry.id,
        kind: 'not-scorable',
        reason,
    }));

/** The answer the agent gave, as the recorded root agent run holds it. */
const recordedAnswer = (spans: readonly SpanRecord[]): string => {
    const mapped = toRunView(spans, harnessRunViewOptions);
    return mapped.kind === 'run' ? mapped.view.rootAgentRun.outputText : '';
};

const scoredTrace = (run: RecordedRun, outcomes: readonly EntryOutcome[]): DemonstrationTrace => {
    if (run.labels.observation === 'ingestion') {
        return { kind: 'ingestion', outcomes };
    }
    const answer = run.outcome.kind === 'completed' ? recordedAnswer(run.outcome.trace.spans) : '';
    return { kind: 'agent-run', questionId: run.labels.questionId, answer, outcomes };
};

const scoredOutcomes = (scored: ScoredRun): readonly EntryOutcome[] => scored.verdicts.map(entryOutcome);

const demonstrationTrace = (
    run: RecordedRun,
    questions: ReadonlyMap<QuestionId, CorpusQuestion>,
    source: ScoredRun['source'],
): DemonstrationTrace => {
    const replayed = replayRecordedRun(run, questions, source);
    switch (replayed.kind) {
        case 'scored':
            return scoredTrace(run, scoredOutcomes(replayed.run));
        case 'failed-while-recording':
            return { kind: 'run-failed', questionId: run.labels.questionId, reason: replayed.problem.reason };
        case 'unscorable':
            return scoredTrace(run, unscorableOutcomes(run, replayed.problem.reason));
        default:
            return replayed satisfies never;
    }
};

/** Why a preset has no line: refused live (scripted-only), or the session stopped before it ran. */
const notRecordedReason = (preset: StudioFaultPreset): string => {
    const availability = presetAvailability(preset, 'live');
    return availability.kind === 'refused' ? availability.reason : 'not recorded: the session stopped before it ran';
};

/** A preset with its recorded traces, or not run when the recording holds none of its lines. */
const presetDemonstration = (
    preset: StudioFaultPreset,
    traces: readonly DemonstrationTrace[] | undefined,
): PresetDemonstration =>
    traces === undefined
        ? {
              kind: 'not-run',
              preset: preset.id,
              expectedEntry: preset.faultCase.entryId,
              reason: notRecordedReason(preset),
          }
        : { kind: 'ran', preset: preset.id, expectedEntry: preset.faultCase.entryId, traces };

/**
 * The demonstration report of a recording, scored offline with replay's own per-run scoring: the same detectors on
 * the same sanitized traces, no model, no storage. Pure, so a committed recording always scores to the same report.
 */
export const scoreDemonstrationRecording = (
    recording: DemonstrationRecording,
    corpus: readonly CorpusQuestion[],
): DemonstrationReport => {
    const { manifest, runs } = recording.fixtures;
    const source = sourceOf(manifest.mode);
    const questions = new Map(corpus.map((question) => [question.id, question]));
    const tracesByPreset = Map.groupBy(
        runs.map((run) => ({
            preset: presetOfHarnessKey(run.labels.harnessKey),
            trace: demonstrationTrace(run, questions, source),
        })),
        ({ preset }) => preset,
    );
    return {
        // The report names its agent model in its own field, so its versions are the recording's packages alone.
        provenance: { ...replayProvenance(manifest, source), versions: manifest.versions },
        agentModel: manifest.models.agent,
        questionCount: demonstrationQuestions(corpus).length,
        presets: studioFaultPresetList.map((preset) =>
            presetDemonstration(
                preset,
                tracesByPreset.get(preset.id)?.map(({ trace }) => trace),
            ),
        ),
        spend: recording.spend,
        basis: { kind: 'recorded-traces', fixtures: recording.name },
    };
};
