import { z } from 'zod';

import { spanIdSchema, traceIdSchema } from './model.ts';

const undefinedToNull = <T>(value: T | null | undefined): T | null => value ?? null;

/**
 * The subset of a stored span the views need. Mastra's storage and Studio's "Download trace JSON" both decode
 * here (dates arrive as `Date` or ISO strings). `spanType` stays a plain string so unknown span kinds pass through.
 */
export const spanRecordSchema = z.object({
    traceId: traceIdSchema,
    spanId: spanIdSchema,
    parentSpanId: spanIdSchema.nullish().transform(undefinedToNull),
    name: z.string().min(1),
    spanType: z.string().min(1),
    /** The agent, tool or step a span belongs to; an empty id counts as none. */
    entityId: z
        .string()
        .nullish()
        .transform((entityId) => (entityId === '' ? null : undefinedToNull(entityId))),
    startedAt: z.coerce.date(),
    /** `null` while the span is still running: storage holds in-flight spans before their output is recorded. */
    endedAt: z.coerce.date().nullish().transform(undefinedToNull),
    isEvent: z
        .boolean()
        .nullish()
        .transform((isEvent) => isEvent ?? false),
    attributes: z
        .record(z.string(), z.unknown())
        .nullish()
        .transform((attributes) => attributes ?? {}),
    input: z.unknown().optional(),
    output: z.unknown().optional(),
    error: z.unknown().optional(),
});
export type SpanRecord = z.infer<typeof spanRecordSchema>;

export const spanRecordListSchema = z.array(spanRecordSchema).readonly();
