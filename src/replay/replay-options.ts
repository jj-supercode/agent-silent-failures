import { parseArgs } from 'node:util';

export type ReplayOptions = {
    /** `null` picks the newest committed fixture set. */
    readonly fixtureDirectory: string | null;
    /** `null` writes to `results/replay/`. */
    readonly outputDirectory: string | null;
    readonly details: boolean;
};

export const replayUsage = 'pnpm replay [--fixtures <dir>] [--out <dir>] [--details] [--json | --plain]';

/** Reads `pnpm replay` arguments (see `replayUsage`); throws on an unknown flag. */
export const replayOptionsFromArgs = (args: readonly string[]): ReplayOptions => {
    const { values } = parseArgs({
        args: [...args],
        strict: true,
        options: {
            fixtures: { type: 'string' },
            out: { type: 'string' },
            details: { type: 'boolean', default: false },
        },
    });
    return {
        fixtureDirectory: values.fixtures ?? null,
        outputDirectory: values.out ?? null,
        details: values.details,
    };
};
