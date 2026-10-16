import type { CorpusQuestion } from '../../corpus/index.ts';
import type { RecordingProgress } from '../../record/index.ts';
import { studioFaultPresetList } from '../faults/presets.ts';
import { studioModeOf, type StudioAgentModel } from '../faults/studio-configuration.ts';
import { demonstratePreset, plannedTraceCount, type TraceRecorder } from './drive-preset.ts';
import type { DemonstrationSpend, PresetDemonstration } from './model.ts';
import { requiredDemonstrationQuestions } from './questions.ts';
import {
    appendLine,
    createLineTally,
    writeRecordingFiles,
    type LineTally,
    type MatrixRecording,
} from './recording-files.ts';

export type MatrixRequest = {
    readonly corpus: readonly CorpusQuestion[];
    readonly model: StudioAgentModel;
    readonly recording: MatrixRecording;
    /** Called as each preset finishes, with Studio's verdicts, for progress output. */
    readonly onPresetDone: (studioScored: PresetDemonstration) => void;
    /** The session's spend so far, written to `spend.json`; `null` without a guarded model. */
    readonly spend: () => DemonstrationSpend | null;
};

/** What a recorded matrix leaves besides its fixture set: Studio's own verdicts, for the cross-check. */
export type RecordedMatrix = {
    readonly studioScored: readonly PresetDemonstration[];
    readonly progress: RecordingProgress;
};

/** How many fixture lines the matrix plans: the manifest's `plannedRuns`. */
export const plannedMatrixRuns = (model: StudioAgentModel, corpus: readonly CorpusQuestion[]): number => {
    const questionCount = requiredDemonstrationQuestions(corpus).length;
    return studioFaultPresetList.reduce(
        (total, preset) => total + plannedTraceCount(preset, studioModeOf(model), questionCount),
        0,
    );
};

/** Writes each trace's line as it finishes, then the manifest and spend that now include it. */
const traceRecorder =
    (request: MatrixRequest, tally: LineTally): TraceRecorder =>
    async ({ recorded }) => {
        const progress = tally.add(await appendLine(request.recording, recorded));
        await writeRecordingFiles(request.recording, progress, request.spend());
    };

/**
 * Drives every Studio preset, one harness at a time, and records each trace it produced as a sanitized fixture line
 * in `request.recording` as soon as it exists, in the same format and with the same manifest as a `demo:live`
 * recording. The report is derived from those lines afterwards (`scoreDemonstrationRecording`); Studio's own
 * verdicts come back for the check that both agree.
 */
export const recordDemonstrationMatrix = async (request: MatrixRequest): Promise<RecordedMatrix> => {
    const questions = requiredDemonstrationQuestions(request.corpus);
    const tally = createLineTally();
    await writeRecordingFiles(request.recording, tally.read(), request.spend());
    const onTrace = traceRecorder(request, tally);
    const studioScored = await Array.fromAsync(studioFaultPresetList, async (preset) => {
        const presetRun = await demonstratePreset({ preset, model: request.model, questions, onTrace });
        request.onPresetDone(presetRun);
        return presetRun;
    });
    const progress: RecordingProgress = { ...tally.read(), stoppedEarly: null };
    await writeRecordingFiles(request.recording, progress, request.spend());
    return { studioScored, progress };
};
