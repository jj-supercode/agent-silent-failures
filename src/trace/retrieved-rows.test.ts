import { describe, expect, test } from 'vitest';

import { decodeHitList } from './retrieved-rows.ts';
import { descendingScore, sampleHits } from './testing.ts';

const keptRows = 3;
const cutRows = 7;

describe('decodeHitList', () => {
    test('decodes every hit and reports no truncation for an uncut list', () => {
        const hits = sampleHits(keptRows, descendingScore);
        expect(decodeHitList({ hits })).toEqual({ kind: 'rows', hits, truncatedItems: 0 });
    });

    test('parses the serializer marker into truncatedItems and never counts it as a hit', () => {
        const hits = sampleHits(keptRows, descendingScore);
        expect(decodeHitList({ hits: [...hits, `[…${cutRows} more items]`] })).toEqual({
            kind: 'rows',
            hits,
            truncatedItems: cutRows,
        });
    });

    test('decodes a null score (how JSON stores NaN) as NaN', () => {
        const [hit] = sampleHits(1, descendingScore);
        const decoded = decodeHitList({ hits: [{ ...hit, score: null }] });
        expect(decoded.kind === 'rows' && Number.isNaN(decoded.hits[0]?.score)).toBe(true);
    });

    test('keeps extra hit fields out of the decoded row', () => {
        const [hit] = sampleHits(1, descendingScore);
        expect(decodeHitList({ hits: [{ ...hit, citation: 'S1' }] })).toEqual({
            kind: 'rows',
            hits: [hit],
            truncatedItems: 0,
        });
    });

    test.each([
        ['an error payload', { error: 'upstream 503' }],
        ['a list without the hits key', { sources: [] }],
        ['a marker that is not the last item', { hits: ['[…2 more items]', ...sampleHits(1, descendingScore)] }],
        ['a hit without a score', { hits: [{ chunkId: 'c', sourceId: 's', text: 't' }] }],
        ['a non-object output', 'no rows'],
    ])('treats %s as not-rows', (_label, output) => {
        expect(decodeHitList(output)).toEqual({ kind: 'not-rows' });
    });

    test('an empty hit list is rows with zero hits, not not-rows', () => {
        expect(decodeHitList({ hits: [] })).toEqual({ kind: 'rows', hits: [], truncatedItems: 0 });
    });
});
