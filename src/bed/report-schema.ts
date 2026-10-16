import { z } from 'zod';

import { faultIdSchema, severityIdSchema, variationIdSchema } from '../catalog/index.ts';
import { entryIdSchema } from '../entries/index.ts';
import { unitIntervalSchema } from '../trace/index.ts';
import type {
    BedReport,
    ConfusionRow,
    DetectorReport,
    HeadlineRow,
    Rate,
    ReportProvenance,
    RunSource,
    SplitReport,
    ThresholdSensitivity,
} from './model.ts';

/**
 * The schema of `results/offline/report.json` and `results/replay/report.json`: what `renderJsonReport` writes,
 * read back by the docs generator. Each schema is checked against the bed's own type, so the two cannot drift.
 */
const countSchema = z.int().nonnegative();

export const runSourceSchema = z.enum(['scripted', 'recorded', 'live']) satisfies z.ZodType<RunSource>;

export const rateSchema = z.object({
    events: countSchema,
    trials: countSchema,
    share: unitIntervalSchema.nullable(),
    interval: z
        .object({
            lower: unitIntervalSchema,
            upper: unitIntervalSchema,
            ruleOfThreeUpper: unitIntervalSchema.nullable(),
        })
        .nullable(),
}) satisfies z.ZodType<Rate>;

const faultCatchFields = {
    caught: rateSchema,
    caughtWhenExpressed: rateSchema,
    notExpressed: countSchema,
    firedWhenNotExpressed: countSchema,
};

const detectorReportSchema = z.object({
    entryId: entryIdSchema,
    ...faultCatchFields,
    caughtBySeverity: z.array(z.object({ faultId: faultIdSchema, severity: severityIdSchema, ...faultCatchFields })),
    notApplicableOnFaulted: countSchema,
    falseAlarms: rateSchema,
    falseAlarmsByVariation: z.array(
        z.object({
            variation: variationIdSchema,
            hardNegative: z.boolean(),
            falseAlarms: rateSchema,
            notApplicable: countSchema,
        }),
    ),
}) satisfies z.ZodType<DetectorReport>;

const firedByEntrySchema = z.array(z.object({ entryId: entryIdSchema, fired: rateSchema }));

const confusionRowSchema = z.object({
    condition: z.string(),
    ownEntryId: entryIdSchema.nullable(),
    firedByEntry: firedByEntrySchema,
}) satisfies z.ZodType<ConfusionRow>;

const thresholdSensitivitySchema = z.object({
    entryId: entryIdSchema,
    threshold: z.string(),
    points: z.array(
        z.object({ value: z.number(), isDefault: z.boolean(), caught: rateSchema, falseAlarms: rateSchema }),
    ),
}) satisfies z.ZodType<ThresholdSensitivity>;

const headlineRowSchema = z.object({
    condition: z.string(),
    agentRuns: countSchema,
    firedByEntry: firedByEntrySchema,
    goldAnswerFound: rateSchema,
    meanGoldSentenceRecall: unitIntervalSchema.nullable(),
}) satisfies z.ZodType<HeadlineRow>;

const splitReportSchema = z.object({
    split: z.enum(['dev', 'held-out']),
    agentRuns: countSchema,
    ingestions: countSchema,
    detectors: z.array(detectorReportSchema),
    confusion: z.array(confusionRowSchema),
    sensitivity: z.array(thresholdSensitivitySchema),
    headline: z.array(headlineRowSchema),
}) satisfies z.ZodType<SplitReport>;

export const reportProvenanceSchema = z.object({
    source: runSourceSchema,
    platform: z.string(),
    generatedOn: z.string(),
    versions: z.record(z.string(), z.string()),
}) satisfies z.ZodType<ReportProvenance>;

export const storedBedReportSchema = z.object({
    provenance: reportProvenanceSchema,
    sources: z.array(runSourceSchema),
    splits: z.array(splitReportSchema),
}) satisfies z.ZodType<BedReport & { readonly provenance: ReportProvenance }>;
export type StoredBedReport = z.infer<typeof storedBedReportSchema>;
