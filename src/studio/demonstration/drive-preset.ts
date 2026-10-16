import type { Entry } from '../../entries/index.ts';
import { awaitStoredTrace, ragAgentKey, studioRequestContext, supervisorKey } from '../../harness/index.ts';
import type { RecordedLabels, RecordedRunInput } from '../../record/index.ts';
import { traceIdSchema, type TraceId } from '../../trace/index.ts';
import { presetAvailability } from '../faults/preset-availability.ts';
import type { StudioFaultPreset, StudioMode } from '../faults/model.ts';
import { presetObservation, type PresetObservation } from '../faults/preset-observation.ts';
import { studioModeOf, type StudioAgentModel } from '../faults/studio-configuration.ts';
import { startStudioHarness, type StudioHarness } from '../start-studio-harness.ts';
import type { DemonstrationTrace, EntryOutcome, PresetDemonstration } from './model.ts';
import type { DemonstrationQuestion, DemonstrationQuestions } from './questions.ts';
import { demonstrationLabels } from './recording-labels.ts';
import { recordedTraceOutcome } from './record-trace.ts';
import { scoreTraceWithEntries } from './score-trace.ts';

/** One trace a preset produced: as Studio's trace scoring judged it, and as its fixture line records it. */
export type DrivenTrace = { readonly studioScored: DemonstrationTrace; readonly recorded: RecordedRunInput };

/** Called with each trace as soon as it exists, so a recording keeps every finished trace through an interrupt. */
export type TraceRecorder = (trace: DrivenTrace) => Promise<void>;

/** The registered scorers of the entries that read this kind of trace. */
const scorersFor = (harness: StudioHarness, kind: Entry['kind']) =>
    harness.entryScorers.filter(({ entry }) => entry.kind === kind);

const errorText = (error: unknown): string =>
    error instanceof Error ? `${error.name}: ${error.message}` : String(error);

type TraceContext = {
    readonly harness: StudioHarness;
    readonly preset: StudioFaultPreset;
    readonly mode: StudioMode;
};

/** A run that left nothing to score: recorded as failed with its reason, never dropped. */
const failedTrace = (labels: RecordedLabels, reason: string): DrivenTrace => ({
    studioScored: { kind: 'run-failed', questionId: labels.questionId, reason },
    recorded: { labels, outcome: { kind: 'failed', reason } },
});

/** Records the stored trace and scores it through Studio; `scored` shapes the Studio verdicts into a trace. */
const recordStoredTrace = async (
    harness: StudioHarness,
    labels: RecordedLabels,
    traceId: TraceId,
    scored: (outcomes: readonly EntryOutcome[]) => DemonstrationTrace,
): Promise<DrivenTrace> => {
    const outcome = await recordedTraceOutcome(harness.mastra, traceId);
    if (outcome.kind === 'failed') {
        return failedTrace(labels, outcome.reason);
    }
    const entryKind = labels.observation === 'ingestion' ? 'ingestion' : 'run';
    return {
        studioScored: scored(await scoreTraceWithEntries(harness.mastra, traceId, scorersFor(harness, entryKind))),
        recorded: { labels, outcome },
    };
};

/**
 * One chat, as Studio sends it: the plain question to the RAG agent, or the task message to the supervisor, with the
 * request context Studio's server gives every request. A run that throws (a refused model call, a provider error) is
 * recorded as failed, never dropped.
 */
const chat = async (
    { harness, preset, mode }: TraceContext,
    agent: Exclude<PresetObservation, 'ingestion'>,
    { question, supervisorMessage }: DemonstrationQuestion,
): Promise<DrivenTrace> => {
    const labels = demonstrationLabels(preset, mode, { kind: agent, questionId: question.id });
    const toSupervisor = agent === 'supervisor-chat';
    try {
        const result = await harness.mastra
            .getAgent(toSupervisor ? supervisorKey : ragAgentKey)
            .generate(toSupervisor ? supervisorMessage : question.question, { requestContext: studioRequestContext() });
        const traceId = traceIdSchema.safeParse(result.traceId);
        if (!traceId.success || !(await awaitStoredTrace(harness.mastra, traceId.data))) {
            return failedTrace(labels, 'the run left no readable trace');
        }
        return await recordStoredTrace(harness, labels, traceId.data, (outcomes) => ({
            kind: 'agent-run',
            questionId: question.id,
            answer: result.text,
            outcomes,
        }));
    } catch (error) {
        return failedTrace(labels, errorText(error));
    }
};

const ingestion = (
    { harness, preset, mode }: TraceContext,
    [firstQuestion]: DemonstrationQuestions,
): Promise<DrivenTrace> =>
    recordStoredTrace(
        harness,
        demonstrationLabels(preset, mode, { kind: 'ingestion', questionId: firstQuestion.question.id }),
        harness.ingestion.traceId,
        (outcomes) => ({ kind: 'ingestion', outcomes }),
    );

export type PresetDrive = {
    readonly preset: StudioFaultPreset;
    readonly model: StudioAgentModel;
    readonly questions: DemonstrationQuestions;
    readonly onTrace: TraceRecorder;
};

/**
 * Starts the Studio harness under one preset and drives it as a Studio user would, returning Studio's own verdicts.
 * An ingestion preset is read from the session's corpus ingestion trace (ingestion calls no model); any other preset
 * asks every question once. Every trace is sanitized, scored through Studio with every entry that applies to it (so
 * a detector firing where it should not shows too), and handed to `onTrace` before the next one starts.
 */
export const demonstratePreset = async ({
    preset,
    model,
    questions,
    onTrace,
}: PresetDrive): Promise<PresetDemonstration> => {
    const expectedEntry = preset.faultCase.entryId;
    const mode = studioModeOf(model);
    const availability = presetAvailability(preset, mode);
    if (availability.kind === 'refused') {
        return { kind: 'not-run', preset: preset.id, expectedEntry, reason: availability.reason };
    }
    await using harness = await startStudioHarness({ model, preset });
    const context: TraceContext = { harness, preset, mode };
    const observation = presetObservation(preset);
    const handedOn = async (driven: Promise<DrivenTrace>): Promise<DrivenTrace> => {
        const trace = await driven;
        await onTrace(trace);
        return trace;
    };
    const traces: readonly DrivenTrace[] =
        observation === 'ingestion'
            ? [await handedOn(ingestion(context, questions))]
            : await Array.fromAsync(questions, (question) => handedOn(chat(context, observation, question)));
    return { kind: 'ran', preset: preset.id, expectedEntry, traces: traces.map((trace) => trace.studioScored) };
};

/** How many fixture lines a preset writes: none when it is refused in this mode, one ingestion, or one per question. */
export const plannedTraceCount = (preset: StudioFaultPreset, mode: StudioMode, questionCount: number): number => {
    if (presetAvailability(preset, mode).kind === 'refused') {
        return 0;
    }
    return presetObservation(preset) === 'ingestion' ? 1 : questionCount;
};
