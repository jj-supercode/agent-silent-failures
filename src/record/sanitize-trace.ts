import type { z } from 'zod';

import { spanPayloadSchemas, spanTypes, type SpanId, type SpanRecord } from '../trace/index.ts';

/**
 * What a recorded trace keeps. Detectors read run and ingestion views, which are built from these span types alone
 * (a `workflow_run` only as the root that holds a workflow's agents); everything else (model calls, processors,
 * prompts, the stored RequestContext, provider metadata) is dropped.
 */
export const keptSpanTypes: ReadonlySet<string> = new Set([
    spanTypes.agentRun,
    spanTypes.toolCall,
    spanTypes.mcpToolCall,
    spanTypes.ragIngestion,
    spanTypes.ragAction,
    spanTypes.workflowRun,
]);

type SpanPayload = Pick<SpanRecord, 'attributes' | 'input' | 'output' | 'error'>;

/**
 * The fields of a payload the view decoders read, by their own schema (zod strips unknown keys), or `undefined`
 * when the payload does not have that shape and so is never read.
 */
const readFields = (schema: z.ZodType, value: unknown): unknown => schema.safeParse(value).data;

const keptAttributes = (schema: z.ZodType, value: unknown): Readonly<Record<string, unknown>> => {
    const kept = readFields(schema, value);
    return typeof kept === 'object' && kept !== null ? { ...kept } : {};
};

/** Only a thrown error's name and message survive: stacks carry local file paths. */
const errorSummary = (error: unknown): unknown =>
    error === undefined || error === null
        ? undefined
        : (readFields(spanPayloadSchemas.toolCall.error, error) ?? { message: 'error' });

const payloadFor = (span: SpanRecord): SpanPayload => {
    switch (span.spanType) {
        case spanTypes.agentRun:
            return {
                attributes: keptAttributes(spanPayloadSchemas.agentRun.attributes, span.attributes),
                output: readFields(spanPayloadSchemas.agentRun.output, span.output),
            };
        case spanTypes.toolCall:
        case spanTypes.mcpToolCall:
            return { attributes: {}, input: span.input, output: span.output, error: errorSummary(span.error) };
        case spanTypes.ragIngestion:
            return { attributes: {}, output: readFields(spanPayloadSchemas.ragIngestion.output, span.output) };
        case spanTypes.ragAction:
            return {
                attributes: keptAttributes(spanPayloadSchemas.ragAction.attributes, span.attributes),
                output: readFields(spanPayloadSchemas.ragAction.output, span.output),
            };
        default:
            return { attributes: {} };
    }
};

const nearestKeptAncestor = (
    span: SpanRecord,
    byId: ReadonlyMap<SpanId, SpanRecord>,
    visited: ReadonlySet<SpanId> = new Set([span.spanId]),
): SpanId | null => {
    const parent = span.parentSpanId === null ? undefined : byId.get(span.parentSpanId);
    if (parent === undefined) {
        return span.parentSpanId;
    }
    // A parent cycle never occurs in Mastra traces; stopping at the repeated span keeps the walk finite regardless.
    if (keptSpanTypes.has(parent.spanType) || visited.has(parent.spanId)) {
        return parent.spanId;
    }
    return nearestKeptAncestor(parent, byId, new Set([...visited, parent.spanId]));
};

/**
 * Reduces a stored trace to the skeleton detectors read: kept span types only, each re-parented to its nearest kept
 * ancestor (so agent ownership, delegation children and the single root survive), with each payload cut to the
 * fields its view decoder reads (`spanPayloadSchemas`). A parent id missing from the trace stays as it is, so a cut
 * trace still reads as cut.
 */
export const sanitizeTrace = (spans: readonly SpanRecord[]): readonly SpanRecord[] => {
    const byId = new Map(spans.map((span) => [span.spanId, span]));
    return spans
        .filter((span) => keptSpanTypes.has(span.spanType))
        .map((span) => ({
            traceId: span.traceId,
            spanId: span.spanId,
            parentSpanId: nearestKeptAncestor(span, byId),
            name: span.name,
            spanType: span.spanType,
            entityId: span.entityId,
            startedAt: span.startedAt,
            endedAt: span.endedAt,
            isEvent: span.isEvent,
            ...payloadFor(span),
        }));
};
