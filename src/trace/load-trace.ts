import type { Mastra } from '@mastra/core/mastra';
import { z } from 'zod';

import type { TraceId } from './model.ts';
import { spanRecordListSchema, type SpanRecord } from './span-record.ts';
import { openSpans } from './trace-completeness.ts';

/** Anything that exposes Mastra storage: a `Mastra` instance, or the `mastra` handed to a scorer step. */
export type TraceSource = Pick<Mastra, 'getStorage'>;

export type TraceLoadFailure =
    | { readonly kind: 'no-storage' }
    | { readonly kind: 'no-observability-store' }
    | { readonly kind: 'not-found'; readonly traceId: TraceId }
    | { readonly kind: 'in-progress'; readonly traceId: TraceId; readonly openSpanCount: number }
    | { readonly kind: 'undecodable'; readonly traceId: TraceId; readonly issues: string };

export type TraceLoadResult =
    | { readonly kind: 'loaded'; readonly spans: readonly SpanRecord[] }
    | { readonly kind: 'failed'; readonly failure: TraceLoadFailure };

/**
 * Reads one finished stored trace. Storage holds a run's spans while it is still going (the root without its output),
 * so a trace with any open span is `in-progress`, never handed on: a partial view would read as an empty answer.
 * Callers that just ran an agent must flush the exporters first; until then the trace is `not-found`.
 */
export const loadTraceSpans = async (source: TraceSource, traceId: TraceId): Promise<TraceLoadResult> => {
    const storage = source.getStorage();
    if (storage === undefined) {
        return { kind: 'failed', failure: { kind: 'no-storage' } };
    }
    const observability = await storage.getStore('observability');
    if (observability === undefined) {
        return { kind: 'failed', failure: { kind: 'no-observability-store' } };
    }
    const trace = await observability.getTrace({ traceId });
    if (trace === null || trace.spans.length === 0) {
        return { kind: 'failed', failure: { kind: 'not-found', traceId } };
    }
    const spans = spanRecordListSchema.safeParse(trace.spans);
    if (!spans.success) {
        return { kind: 'failed', failure: { kind: 'undecodable', traceId, issues: z.prettifyError(spans.error) } };
    }
    const open = openSpans(spans.data);
    return open.length === 0
        ? { kind: 'loaded', spans: spans.data }
        : { kind: 'failed', failure: { kind: 'in-progress', traceId, openSpanCount: open.length } };
};
