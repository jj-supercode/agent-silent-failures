import { z } from 'zod';

import { reportProvenanceSchema } from '../../bed/index.ts';
import { questionIdSchema } from '../../corpus/index.ts';
import { entryIdSchema } from '../../entries/index.ts';
import { modelIdSchema } from '../../trace/index.ts';
import { studioFaultIdSchema } from '../faults/model.ts';

/** What one entry's scorer said about one trace, through Mastra's trace scoring (the Studio path). */
export const entryOutcomeSchema = z.object({
    entryId: entryIdSchema,
    kind: z.enum(['fired', 'clear', 'not-scorable', 'scoring-failed']),
    reason: z.string(),
});
export type EntryOutcome = z.infer<typeof entryOutcomeSchema>;

/** One trace a preset produced: a chat's agent run, or the session's corpus ingestion. */
export const demonstrationTraceSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('agent-run'),
        questionId: questionIdSchema,
        answer: z.string(),
        outcomes: z.array(entryOutcomeSchema).readonly(),
    }),
    z.object({ kind: z.literal('ingestion'), outcomes: z.array(entryOutcomeSchema).readonly() }),
    /** The agent run itself failed (a refused or failed model call): nothing to score. */
    z.object({ kind: z.literal('run-failed'), questionId: questionIdSchema, reason: z.string() }),
]);
export type DemonstrationTrace = z.infer<typeof demonstrationTraceSchema>;

export const presetDemonstrationSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('ran'),
        preset: studioFaultIdSchema,
        expectedEntry: entryIdSchema,
        traces: z.array(demonstrationTraceSchema).readonly(),
    }),
    /** A scripted-only preset in a live matrix: never run, and said so. */
    z.object({
        kind: z.literal('not-run'),
        preset: studioFaultIdSchema,
        expectedEntry: entryIdSchema,
        reason: z.string(),
    }),
]);
export type PresetDemonstration = z.infer<typeof presetDemonstrationSchema>;

/** A session's spend, from the guard's settled calls (estimated on a dry run); also the recording's `spend.json`. */
export const demonstrationSpendSchema = z.object({ usd: z.number().nonnegative(), modelCalls: z.int().nonnegative() });
export type DemonstrationSpend = z.infer<typeof demonstrationSpendSchema>;

/** What a report's verdicts rest on, and so whether they can be scored again. */
export const reportBasisSchema = z.discriminatedUnion('kind', [
    /** Scored offline from a committed fixture set (repo-relative directory): `pnpm demonstration --rescore` redoes it. */
    z.object({ kind: z.literal('recorded-traces'), fixtures: z.string().min(1) }),
    /** Scored once while the session ran, before traces were recorded: nothing to score again. */
    z.object({ kind: z.literal('verdicts-only') }),
]);
export type ReportBasis = z.infer<typeof reportBasisSchema>;

/** `results/demonstration/{scripted,live}.json`: every preset driven through the Studio agents and scored. */
export const demonstrationReportSchema = z.object({
    provenance: reportProvenanceSchema,
    agentModel: modelIdSchema,
    questionCount: z.int().nonnegative(),
    presets: z.array(presetDemonstrationSchema).readonly(),
    /** The live session's spend, from the provider's reported usage; `null` for a scripted matrix. */
    spend: demonstrationSpendSchema.nullable(),
    /** A report written before traces were recorded has no basis field: it reads as verdicts-only. */
    basis: reportBasisSchema.default({ kind: 'verdicts-only' }),
});
export type DemonstrationReport = z.infer<typeof demonstrationReportSchema>;
