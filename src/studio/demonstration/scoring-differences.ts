import { isDeepStrictEqual } from 'node:util';

import type { StudioFaultId } from '../faults/model.ts';
import type { DemonstrationReport, PresetDemonstration } from './model.ts';

/**
 * Presets whose verdicts from the recorded traces differ from Studio's trace scoring of the full stored traces. Any
 * difference means the sanitized skeleton lost something a detector reads; none means the fixtures stand in for Studio.
 */
export const scoringDifferences = (
    studioScored: readonly PresetDemonstration[],
    fromRecording: DemonstrationReport,
): readonly StudioFaultId[] => {
    const recorded = new Map(fromRecording.presets.map((presetRun) => [presetRun.preset, presetRun]));
    return studioScored
        .filter((presetRun) => !isDeepStrictEqual(presetRun, recorded.get(presetRun.preset)))
        .map((presetRun) => presetRun.preset);
};
