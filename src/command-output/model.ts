import { z } from 'zod';

import { unitIntervalSchema } from '../trace/model.ts';

/** Bumped on any change a consumer of `--json` could notice: a renamed or removed field, a new required field. */
export const eventSchemaVersion = 1;

/**
 * How a command talks: `human` styles and rewrites one progress line, `plain` prints stable prefixed lines with no
 * ANSI, `json` prints one event per line and nothing else on stdout.
 */
export type OutputMode =
    | { readonly kind: 'human'; readonly color: boolean; readonly rewritesProgress: boolean }
    | { readonly kind: 'plain' }
    | { readonly kind: 'json' };

export const outputModeNames = ['human', 'plain', 'json'] as const;
export type OutputModeName = (typeof outputModeNames)[number];

/** One meaning per exit code; every command's registry names the codes it can return. */
export type ExitCode = { readonly code: number; readonly meaning: string };

export type ExitCodeRegistry = { readonly invalidArguments: ExitCode; readonly unexpectedError: ExitCode } & Readonly<
    Record<string, ExitCode>
>;

const rateFactSchema = z.object({
    /** The scope a rate belongs to, such as a split; `null` when the command has one scope. */
    group: z.string().nullable(),
    subject: z.string(),
    measure: z.string(),
    events: z.int().nonnegative(),
    trials: z.int().nonnegative(),
    /** Exact `events / trials`; `null` with no trials. */
    share: unitIntervalSchema.nullable(),
    /** Wilson 95% score interval; `null` with no trials. */
    interval: z.object({ lower: unitIntervalSchema, upper: unitIntervalSchema }).nullable(),
});
export type RateFact = z.infer<typeof rateFactSchema>;

const nextStepSchema = z.object({ command: z.string(), purpose: z.string() });
export type NextStep = z.infer<typeof nextStepSchema>;

const eventBase = {
    schemaVersion: z.literal(eventSchemaVersion),
    command: z.string(),
    /** Milliseconds since the command started. */
    elapsedMs: z.number().nonnegative(),
};

const startEventSchema = z.object({
    ...eventBase,
    event: z.literal('start'),
    title: z.string(),
    description: z.string(),
    /** What the numbers in the summary mean; `null` for a command that measures nothing. */
    measures: z.string().nullable(),
    /** Planned units of work; `null` when the command cannot know them up front. */
    total: z.int().nonnegative().nullable(),
    unit: z.string().nullable(),
    facts: z.record(z.string(), z.string()),
});

const progressEventSchema = z.object({
    ...eventBase,
    event: z.literal('progress'),
    done: z.int().nonnegative(),
    total: z.int().nonnegative(),
    failed: z.int().nonnegative(),
    unit: z.string(),
    /** Estimated milliseconds left; `null` before the first unit finishes and after the last. */
    etaMs: z.number().nonnegative().nullable(),
    /** Spend so far; `null` for a command that spends nothing. */
    spendUsd: z.number().nonnegative().nullable(),
});

const warningEventSchema = z.object({
    ...eventBase,
    event: z.literal('warning'),
    message: z.string(),
    details: z.array(z.string()),
});

const failureEventSchema = z.object({
    ...eventBase,
    event: z.literal('failure'),
    /** What failed: a run id, a page, a repro; `null` for the command as a whole. */
    subject: z.string().nullable(),
    what: z.string(),
    why: z.string(),
    /** The action that fixes it; `null` when there is none to suggest. */
    fix: z.string().nullable(),
});

const summaryEventSchema = z.object({
    ...eventBase,
    event: z.literal('summary'),
    ok: z.boolean(),
    exitCode: z.int().nonnegative(),
    exitMeaning: z.string(),
    headline: z.string(),
    counts: z.record(z.string(), z.number()),
    rates: z.array(rateFactSchema),
    /** Spend of this command; `null` for a command that spends nothing. */
    spendUsd: z.number().nonnegative().nullable(),
    /** Files written, repo-relative inside the repo and absolute elsewhere. */
    outputs: z.array(z.string()),
    next: z.array(nextStepSchema),
    peakRssBytes: z.int().nonnegative(),
});

/** One line of `--json` output. Parse a line with this schema to consume it. */
export const commandEventSchema = z.discriminatedUnion('event', [
    startEventSchema,
    progressEventSchema,
    warningEventSchema,
    failureEventSchema,
    summaryEventSchema,
]);
export type CommandEvent = z.infer<typeof commandEventSchema>;
export type SummaryEvent = z.infer<typeof summaryEventSchema>;

/** What a command says before it starts: what will happen and what is measured. */
export type CommandHeader = {
    readonly title: string;
    readonly description: string;
    readonly measures: string | null;
    readonly total: number | null;
    readonly unit: string | null;
    /**
     * Named facts, such as the stack or the fixture set: the camelCase name is the JSON key; spelled out in words, it
     * labels the row a reader sees (`spendCap` reads `Spend cap`).
     */
    readonly facts: ReadonlyArray<readonly [name: Uncapitalize<string>, value: string]>;
};

/** An error a user can act on: what failed, why, and the fix. Never a stack trace. */
export type CommandFailure = {
    readonly subject: string | null;
    readonly what: string;
    readonly why: string;
    readonly fix: string | null;
};

/** What a command reports when it ends; the exit code and its meaning come from the command's registry. */
export type CommandReport = {
    readonly exit: ExitCode;
    readonly headline: string;
    readonly counts: Readonly<Record<string, number>>;
    readonly rates: readonly RateFact[];
    readonly spendUsd: number | null;
    readonly outputs: readonly string[];
    readonly next: readonly NextStep[];
};

/** Per-unit progress a command feeds its tracker. */
export type ProgressUpdate =
    | { readonly kind: 'done'; readonly spendUsd: number | null }
    | { readonly kind: 'failed'; readonly failure: CommandFailure; readonly spendUsd: number | null };

/** A flag shown by `--help`. */
export type OptionHelp = { readonly flag: string; readonly description: string };
