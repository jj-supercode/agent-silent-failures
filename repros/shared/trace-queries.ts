import type { SpanType } from '@mastra/core/observability';
import type { SpanRecord, TraceRecord } from '@mastra/core/storage';

export const spansOfType = (trace: TraceRecord, spanType: SpanType): readonly SpanRecord[] =>
    trace.spans.filter((span) => span.spanType === spanType);

export const parentTypeOf = (trace: TraceRecord, span: SpanRecord): string =>
    trace.spans.find((candidate) => candidate.spanId === span.parentSpanId)?.spanType ?? 'root';

export const rootSpanOf = (trace: TraceRecord): SpanRecord | undefined =>
    trace.spans.find((span) => span.parentSpanId == null);
