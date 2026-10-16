import { studioFaultPresets } from './presets.ts';
import { studioFaultIds, studioFaultIdSchema, type StudioFaultPreset } from './model.ts';

/** How the Studio launcher hands `--fault` to the Mastra project: `mastra dev` passes its environment to the server. */
export const studioFaultVariable = 'STUDIO_FAULT';

export type StudioFaultSelection =
    | { readonly kind: 'none' }
    | { readonly kind: 'preset'; readonly preset: StudioFaultPreset }
    | { readonly kind: 'invalid'; readonly reason: string };

/** Reads a preset id; unset or empty is no fault, anything else must name a preset. */
export const selectStudioFault = (value: string | undefined): StudioFaultSelection => {
    if (value === undefined || value === '') {
        return { kind: 'none' };
    }
    const parsed = studioFaultIdSchema.safeParse(value);
    return parsed.success
        ? { kind: 'preset', preset: studioFaultPresets[parsed.data] }
        : { kind: 'invalid', reason: `unknown fault preset "${value}"; one of: ${studioFaultIds.join(', ')}` };
};

export const studioFaultFromEnvironment = (
    environment: Readonly<Record<string, string | undefined>>,
): StudioFaultSelection => selectStudioFault(environment[studioFaultVariable]);
