import { parseArgs } from 'node:util';

import { z } from 'zod';

import { usdSchema, type Usd } from './budget/model.ts';

/** The default hard cap for one live session; the default plan's worst case stays below it. */
export const defaultMaxUsd = usdSchema.parse(10);

export type LiveMode = 'dry-run' | 'live';

/** A session starts a recording, or resumes one: a resumed recording keeps its own plan and directory. */
export type RecordingRequest =
    | {
          readonly kind: 'new';
          /** `null` runs the whole plan. */
          readonly maxRuns: number | null;
          /** `null`: `fixtures/live/<date>/` for a live session, a fresh temporary directory for a dry run. */
          readonly outputDirectory: string | null;
      }
    | { readonly kind: 'resume'; readonly directory: string };

export type LiveOptions = {
    readonly mode: LiveMode;
    /** The cap on the whole recording: a resumed session counts what earlier sessions spent. */
    readonly maxUsd: Usd;
    readonly judge: boolean;
    readonly recording: RecordingRequest;
};

const liveOptionsSchema = z.object({
    'dry-run': z.boolean(),
    'max-usd': z.coerce.number().positive().pipe(usdSchema).optional(),
    'max-runs': z.coerce.number().int().positive().optional(),
    judge: z.boolean(),
    out: z.string().min(1).optional(),
    resume: z.string().min(1).optional(),
});

export type LiveOptionsResult =
    { readonly kind: 'parsed'; readonly options: LiveOptions } | { readonly kind: 'invalid'; readonly reason: string };

export const liveUsage =
    'pnpm demo:live [--dry-run] [--max-usd <usd>] [--judge] [--max-runs <n>] [--out <dir> | --resume <dir>] ' +
    '[--json | --plain]';

const liveArgOptions = {
    'dry-run': { type: 'boolean', default: false },
    'max-usd': { type: 'string' },
    'max-runs': { type: 'string' },
    judge: { type: 'boolean', default: false },
    out: { type: 'string' },
    resume: { type: 'string' },
} as const;

/** `parseArgs` in strict mode throws on an unknown flag; this turns that into a value. */
const readFlags = (args: readonly string[]): { readonly flags: unknown } | { readonly error: string } => {
    try {
        return { flags: parseArgs({ args: [...args], strict: true, options: liveArgOptions }).values };
    } catch (error) {
        return { error: error instanceof Error ? error.message : String(error) };
    }
};

/** Parses `pnpm demo:live` arguments. Unknown flags are an error: a mistyped `--dry-run` must never start a paid run. */
export const parseLiveOptions = (args: readonly string[]): LiveOptionsResult => {
    const read = readFlags(args);
    if ('error' in read) {
        return { kind: 'invalid', reason: read.error };
    }
    const values = liveOptionsSchema.safeParse(read.flags);
    if (!values.success) {
        return { kind: 'invalid', reason: z.prettifyError(values.error) };
    }
    const { resume, out } = values.data;
    const maxRuns = values.data['max-runs'];
    if (resume !== undefined && (out !== undefined || maxRuns !== undefined)) {
        return {
            kind: 'invalid',
            reason: "--resume keeps the recording's own plan and directory: drop --out and --max-runs",
        };
    }
    return {
        kind: 'parsed',
        options: {
            mode: values.data['dry-run'] ? 'dry-run' : 'live',
            maxUsd: values.data['max-usd'] ?? defaultMaxUsd,
            judge: values.data.judge,
            recording:
                resume === undefined
                    ? { kind: 'new', maxRuns: maxRuns ?? null, outputDirectory: out ?? null }
                    : { kind: 'resume', directory: resume },
        },
    };
};
