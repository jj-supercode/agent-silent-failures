import { z } from 'zod';

import { familyIdSchema, harnessKeySchema, runIdSchema, type RunCondition, type RunLabels } from '../bed/index.ts';
import { faultIdSchema, severityIdSchema, variationIdSchema } from '../catalog/index.ts';
import { questionIdSchema } from '../corpus/index.ts';
import { entryIdSchema } from '../entries/index.ts';
import { modelIdSchema, spanRecordListSchema, traceIdSchema } from '../trace/index.ts';

/**
 * The fixture format version. Replay refuses a version it does not know; a later version may only add fields, so a
 * reader of version N can be widened to N + 1 without breaking committed fixtures.
 */
export const fixtureSchemaVersion = 1;

/** A dry run replays the scripted policies through the live code path; a live run used the real model. */
export const recordingModeSchema = z.enum(['live', 'dry-run']);
export type RecordingMode = z.infer<typeof recordingModeSchema>;

const runConditionSchema = z.discriminatedUnion('kind', [
    z.object({
        kind: z.literal('clean'),
        variation: variationIdSchema,
        hardNegativeFor: z.array(entryIdSchema).readonly(),
    }),
    z.object({
        kind: z.literal('faulted'),
        entryId: entryIdSchema,
        faultId: faultIdSchema,
        severity: severityIdSchema,
    }),
]) satisfies z.ZodType<RunCondition>;

/** `RunLabels` with the question by id: the corpus is committed, so a fixture never copies it. */
const recordedLabelsSchema = z.object({
    runId: runIdSchema,
    split: z.enum(['dev', 'held-out']),
    family: familyIdSchema,
    questionId: questionIdSchema,
    replicate: z.int().nonnegative(),
    seed: z.int().nonnegative(),
    harness: z.enum(['single-agent', 'multi-agent']),
    condition: runConditionSchema,
    observation: z.enum(['agent-run', 'ingestion']),
    modelSource: z.enum(['clean-policy', 'fault-policy']),
    harnessKey: harnessKeySchema,
});
export type RecordedLabels = z.infer<typeof recordedLabelsSchema>;

export const toRecordedLabels = (labels: RunLabels, harnessKey: RecordedLabels['harnessKey']): RecordedLabels => ({
    runId: labels.runId,
    split: labels.split,
    family: labels.family,
    questionId: labels.question.id,
    replicate: labels.replicate,
    seed: labels.seed,
    harness: labels.harness,
    condition: labels.condition,
    observation: labels.observation,
    modelSource: labels.modelSource,
    harnessKey,
});

export const answerJudgementRecordSchema = z.discriminatedUnion('kind', [
    z.object({ kind: z.literal('judged'), correct: z.boolean(), reason: z.string() }),
    z.object({ kind: z.literal('not-judged'), reason: z.string() }),
]);

/** A recorded trace: the sanitized skeleton of spans, decoded with the trace module's own span schema. */
const recordedTraceSchema = z.object({ traceId: traceIdSchema, spans: spanRecordListSchema });

/**
 * One line of `runs.jsonl`. A failed run is recorded too, with its reason, so replay reports it instead of the run
 * silently vanishing from the denominators.
 */
export const recordedRunSchema = z.object({
    labels: recordedLabelsSchema,
    outcome: z.discriminatedUnion('kind', [
        z.object({
            kind: z.literal('completed'),
            trace: recordedTraceSchema,
            judgement: answerJudgementRecordSchema.nullable(),
        }),
        z.object({ kind: z.literal('failed'), reason: z.string() }),
    ]),
});
export type RecordedRun = z.infer<typeof recordedRunSchema>;
/** What the recorder writes: dates still as `Date`, serialized to ISO strings by JSON. */
export type RecordedRunInput = z.input<typeof recordedRunSchema>;

export const fixtureManifestSchema = z.object({
    schemaVersion: z.literal(fixtureSchemaVersion),
    mode: recordingModeSchema,
    /** The day the recording started (UTC), also the fixture directory name. */
    recordedOn: z.iso.date(),
    startedAt: z.iso.datetime(),
    finishedAt: z.iso.datetime(),
    models: z.object({ agent: modelIdSchema, judge: modelIdSchema.nullable() }),
    platform: z.object({ os: z.string(), arch: z.string(), node: z.string() }),
    /** Exact installed versions of the packages that shape a trace. */
    versions: z.record(z.string(), z.string()),
    /** sha256 of the committed corpus file the runs used. */
    corpusSha256: z.string().regex(/^[0-9a-f]{64}$/),
    split: z.enum(['dev', 'held-out']),
    plannedRuns: z.int().nonnegative(),
    recordedRuns: z.int().nonnegative(),
    failedRuns: z.int().nonnegative(),
    /** Why the session stopped early, if it did (e.g. the budget cap); `null` when every planned run was attempted. */
    stoppedEarly: z.string().nullable(),
    keptSpanTypes: z.array(z.string()).readonly(),
});
export type FixtureManifest = z.infer<typeof fixtureManifestSchema>;

export const fixtureFileNames = {
    manifest: 'manifest.json',
    runs: 'runs.jsonl',
    spend: 'spend.json',
} as const;
