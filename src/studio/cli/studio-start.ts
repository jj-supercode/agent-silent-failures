import { commonExitCodes } from '../../command-output/index.ts';
import { presetAvailability } from '../faults/preset-availability.ts';
import { faultListing } from '../faults/preset-text.ts';
import { selectStudioFault, studioFaultVariable } from '../faults/studio-fault-option.ts';
import type { StudioLaunch } from './studio-arguments.ts';

type Environment = Readonly<Record<string, string | undefined>>;

/** What the launcher does: print and exit, refuse before anything starts, or serve the wrapped command. */
export type StudioStart =
    | { readonly kind: 'print'; readonly text: string }
    | { readonly kind: 'refused'; readonly reason: string; readonly exitCode: number }
    | {
          readonly kind: 'serve';
          readonly command: readonly [string, ...string[]];
          /** The launcher's environment with the checked preset id (empty for none) under `STUDIO_FAULT`. */
          readonly environment: Environment;
      };

const refused = (reason: string): StudioStart => ({
    kind: 'refused',
    reason,
    exitCode: commonExitCodes.invalidArguments.code,
});

/**
 * Decides the launch without starting anything: a `--fault` flag wins over `STUDIO_FAULT` already in the
 * environment; an unknown preset, or a scripted-only one in live mode, is refused before `mastra dev` runs.
 */
export const decideStudioStart = (launch: StudioLaunch, environment: Environment): StudioStart => {
    switch (launch.kind) {
        case 'list-faults':
            return { kind: 'print', text: faultListing() };
        case 'invalid':
            return refused(launch.reason);
        case 'start': {
            const selection = selectStudioFault(launch.fault ?? environment[studioFaultVariable]);
            if (selection.kind === 'invalid') {
                return refused(selection.reason);
            }
            const availability = selection.kind === 'preset' ? presetAvailability(selection.preset, launch.mode) : null;
            if (availability?.kind === 'refused') {
                return refused(`${availability.reason}. Nothing was sent`);
            }
            return {
                kind: 'serve',
                command: launch.command,
                environment: {
                    ...environment,
                    [studioFaultVariable]: selection.kind === 'preset' ? selection.preset.id : '',
                },
            };
        }
        default:
            return launch satisfies never;
    }
};
