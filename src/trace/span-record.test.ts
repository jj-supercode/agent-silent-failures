import { describe, expect, test } from 'vitest';

import { spanRecordSchema } from './span-record.ts';

const downloadedSpan = {
    traceId: 't',
    spanId: 's',
    parentSpanId: null,
    name: "tool: 'searchCorpus'",
    spanType: 'tool_call',
    entityId: 'searchCorpus',
    startedAt: '2026-10-14T12:00:00.000Z',
    attributes: null,
    createdAt: '2026-10-14T12:00:00.000Z',
};

describe('spanRecordSchema', () => {
    test('decodes a downloaded span: ISO dates become Date, null attributes become empty', () => {
        const span = spanRecordSchema.parse(downloadedSpan);
        expect(span.startedAt).toEqual(new Date(downloadedSpan.startedAt));
        expect(span.attributes).toEqual({});
    });

    test('normalises a missing parent and entity to null', () => {
        const withoutIds = Object.fromEntries(
            Object.entries(downloadedSpan).filter(([key]) => key !== 'parentSpanId' && key !== 'entityId'),
        );
        expect(spanRecordSchema.parse(withoutIds)).toMatchObject({ parentSpanId: null, entityId: null });
    });

    test('keeps an unknown span type as a plain string', () => {
        expect(spanRecordSchema.parse({ ...downloadedSpan, spanType: 'future_span_kind' }).spanType).toBe(
            'future_span_kind',
        );
    });

    test('rejects a span without a span id', () => {
        expect(spanRecordSchema.safeParse({ ...downloadedSpan, spanId: '' }).success).toBe(false);
    });
});
