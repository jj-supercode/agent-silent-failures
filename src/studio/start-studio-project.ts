import type { Mastra } from '@mastra/core/mastra';

import { StudioFaultRefusedError } from './errors.ts';
import { presetAvailability } from './faults/preset-availability.ts';
import { activeFaultLine } from './faults/preset-text.ts';
import { studioModeOf, type StudioAgentModel } from './faults/studio-configuration.ts';
import { studioFaultFromEnvironment } from './faults/studio-fault-option.ts';
import { startStudioHarness } from './start-studio-harness.ts';

/**
 * What both Studio project entries export: the fault preset named in the environment (set by the Studio launcher from
 * `--fault`), announced on the terminal, then the harness under it. The launcher refuses a bad preset before
 * `mastra dev` starts; the throw here only guards a server started some other way.
 */
export const startStudioProject = async (
    environment: Readonly<Record<string, string | undefined>>,
    model: StudioAgentModel,
): Promise<Mastra> => {
    const selection = studioFaultFromEnvironment(environment);
    if (selection.kind === 'invalid') {
        throw new StudioFaultRefusedError(selection.reason);
    }
    const preset = selection.kind === 'preset' ? selection.preset : null;
    const mode = studioModeOf(model);
    const availability = preset === null ? null : presetAvailability(preset, mode);
    if (availability?.kind === 'refused') {
        throw new StudioFaultRefusedError(availability.reason);
    }
    console.log(activeFaultLine(preset, mode));
    return (await startStudioHarness({ model, preset })).mastra;
};
