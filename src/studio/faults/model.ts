import { z } from 'zod';

import type { FaultCase } from '../../catalog/index.ts';
import type { HarnessConfig } from '../../harness/index.ts';

export const studioFaultIds = [
    'collapsed-embedder',
    'constant-fused-score',
    'default-chunk-size',
    'embed-batch-cap',
    'filter-key-mismatch',
    'filter-key-mismatch-lenient',
    'search-errors',
    'search-errors-lenient',
    'search-drops-results',
    'worker-reply-dropped',
    'supervisor-ignores-workers',
] as const;

/** A Studio fault preset, as `--fault <id>` and `STUDIO_FAULT` name it. */
export const studioFaultIdSchema = z.enum(studioFaultIds);
export type StudioFaultId = z.infer<typeof studioFaultIdSchema>;

/** Which Studio project runs: the scripted agent (`pnpm studio`) or Claude (`pnpm studio:live`). */
export type StudioMode = 'scripted' | 'live';

/**
 * Whether a real model can meet this fault. Live-capable presets break only infrastructure (or a configuration
 * choice), so whatever the model does is its own behaviour; scripted-only presets would need the model itself to
 * misbehave on cue, which no honest infrastructure change can make it do.
 */
export type LiveReach = { readonly kind: 'live-capable' } | { readonly kind: 'scripted-only'; readonly reason: string };

/**
 * One Studio fault: a catalog fault case (its entry, setting and change to the harness), plus any infrastructure
 * trigger Studio adds so a real model can meet the same failure. In scripted mode the case applies whole, its
 * scripted policy included; in live mode only its infrastructure and the trigger apply, and Claude decides.
 */
export type StudioFaultPreset = {
    readonly id: StudioFaultId;
    /** What the preset breaks in the infrastructure or configuration, the trigger included, in one line. */
    readonly breaks: string;
    readonly faultCase: FaultCase;
    /** A change beyond the fault case's own infrastructure (see `live-triggers.ts`), applied in both modes; or none. */
    readonly trigger: ((config: HarnessConfig) => HarnessConfig) | null;
    readonly live: LiveReach;
};
