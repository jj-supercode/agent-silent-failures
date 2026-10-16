import type { SpanRecord } from './span-record.ts';

/** Spans that have started and not yet ended. Event spans are instants and never count as open. */
export const openSpans = (spans: readonly SpanRecord[]): readonly SpanRecord[] =>
    spans.filter((span) => !span.isEvent && span.endedAt === null);
