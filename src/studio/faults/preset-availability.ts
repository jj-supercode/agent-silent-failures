import type { StudioFaultPreset, StudioMode } from './model.ts';

export type PresetAvailability = { readonly kind: 'available' } | { readonly kind: 'refused'; readonly reason: string };

/** A scripted-only preset is refused in live mode: a real model would be shown a fault it can never meet. */
export const presetAvailability = (preset: StudioFaultPreset, mode: StudioMode): PresetAvailability => {
    switch (mode) {
        case 'scripted':
            return { kind: 'available' };
        case 'live':
            return preset.live.kind === 'live-capable'
                ? { kind: 'available' }
                : {
                      kind: 'refused',
                      reason: `the fault preset ${preset.id} is scripted-only (${preset.live.reason}); run it with pnpm studio`,
                  };
        default:
            return mode satisfies never;
    }
};
