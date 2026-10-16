import { familyIdSchema, harnessKeySchema, runIdSchema, type HarnessKey } from '../../bed/index.ts';
import type { QuestionId } from '../../corpus/index.ts';
import type { RecordedLabels } from '../../record/index.ts';
import { studioFaultIdSchema, type StudioFaultId, type StudioFaultPreset, type StudioMode } from '../faults/model.ts';
import type { PresetObservation } from '../faults/preset-observation.ts';
import { presetScriptsTheModel } from '../faults/studio-configuration.ts';

/** Every demonstration run belongs to one family: the Studio configuration, not a bed variation family. */
const studioFamily = familyIdSchema.parse('studio');

const harnessKeyPrefix = 'studio/';

/** Each preset asks each question once, so there is one replicate and no seed to vary. */
const onlyReplicate = 0;
const unseeded = 0;

/**
 * What one recorded line observed: a chat with one agent about a question, or the session's corpus ingestion. The
 * ingestion covers the whole corpus, but a fixture line names one question: the first demonstration question stands
 * in, so the line replays against the committed corpus like any other.
 */
export type RecordedObservation = { readonly kind: PresetObservation; readonly questionId: QuestionId };

/** The preset id in a fixture line: `studio/<preset>` is its harness key, since one harness runs per preset. */
export const presetHarnessKey = (preset: StudioFaultId): HarnessKey =>
    harnessKeySchema.parse(`${harnessKeyPrefix}${preset}`);

/** The preset a fixture line was recorded under, or `null` for a line no demonstration wrote. */
export const presetOfHarnessKey = (harnessKey: HarnessKey): StudioFaultId | null => {
    if (!harnessKey.startsWith(harnessKeyPrefix)) {
        return null;
    }
    const preset = studioFaultIdSchema.safeParse(harnessKey.slice(harnessKeyPrefix.length));
    return preset.success ? preset.data : null;
};

const runSuffix = (observation: RecordedObservation): string =>
    observation.kind === 'ingestion' ? 'ingestion' : observation.questionId;

/**
 * The fixture labels of one demonstration line, in the same format `demo:live` records: the preset's catalog fault
 * case as the condition, and the preset id in the run id and harness key. A live model is never a substituted policy.
 */
export const demonstrationLabels = (
    preset: StudioFaultPreset,
    mode: StudioMode,
    observation: RecordedObservation,
): RecordedLabels => ({
    runId: runIdSchema.parse(`${harnessKeyPrefix}${preset.id}/${runSuffix(observation)}`),
    split: 'held-out',
    family: studioFamily,
    questionId: observation.questionId,
    replicate: onlyReplicate,
    seed: unseeded,
    harness: observation.kind === 'supervisor-chat' ? 'multi-agent' : 'single-agent',
    condition: {
        kind: 'faulted',
        entryId: preset.faultCase.entryId,
        faultId: preset.faultCase.faultId,
        severity: preset.faultCase.severity,
    },
    observation: observation.kind === 'ingestion' ? 'ingestion' : 'agent-run',
    modelSource: mode === 'scripted' && presetScriptsTheModel(preset) ? 'fault-policy' : 'clean-policy',
    harnessKey: presetHarnessKey(preset.id),
});
