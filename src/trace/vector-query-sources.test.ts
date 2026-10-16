import { describe, expect, test } from 'vitest';

import { chunkIdSchema, sourceIdSchema } from './model.ts';
import { decodeVectorQuerySources } from './vector-query-sources.ts';

/** A `tool_call` span output captured from `createVectorQueryTool` (`@mastra/rag` 2.6.7, `@mastra/libsql` 1.26.1). */
const capturedRowsOutput = {
    relevantContext: [
        { text: 'Paris is the capital of France.', source: 'capitals' },
        { text: 'Madrid is the capital of Spain.', source: 'capitals' },
        { text: 'Rome is the capital of Italy.', source: 'capitals' },
    ],
    sources: [
        {
            id: 'f11650bf-b21e-4d8e-a7e1-3edc1592bf03',
            metadata: { text: 'Paris is the capital of France.', source: 'capitals' },
            vector: [],
            score: 0.8281645029783249,
            document: '',
        },
        {
            id: '6c8fd072-b1e0-4ee1-9e77-c8e3ee36c32f',
            metadata: { text: 'Madrid is the capital of Spain.', source: 'capitals' },
            vector: [],
            score: 0.6919704675674438,
            document: '',
        },
        {
            id: 'c932db47-c4fd-43db-bdc6-829f399525d3',
            metadata: { text: 'Rome is the capital of Italy.', source: 'capitals' },
            vector: [],
            score: 0.6918600499629974,
            document: '',
        },
    ],
};

/** The same call with `includeSources: false`: context comes back, scores do not. */
const capturedContextOnlyOutput = { relevantContext: capturedRowsOutput.relevantContext, sources: [] };

/** The same call against a missing index: the tool logs the store error and returns both lists empty. */
const capturedStoreErrorOutput = { relevantContext: [], sources: [] };

const [firstSource] = capturedRowsOutput.sources;

describe('decodeVectorQuerySources', () => {
    test('decodes every source of a captured call into a scored row attributed to its metadata source', () => {
        expect(decodeVectorQuerySources(capturedRowsOutput)).toEqual({
            kind: 'rows',
            hits: capturedRowsOutput.sources.map((source) => ({
                chunkId: chunkIdSchema.parse(source.id),
                sourceId: sourceIdSchema.parse('capitals'),
                score: source.score,
                text: source.metadata.text,
            })),
            truncatedItems: 0,
        });
    });

    test('attributes a source without metadata.source to its own chunk id and falls back to document text', () => {
        const decoded = decodeVectorQuerySources({
            relevantContext: [{}],
            sources: [{ ...firstSource, metadata: {}, document: 'Paris.' }],
        });
        expect(decoded.kind === 'rows' ? decoded.hits.map(({ sourceId, text }) => ({ sourceId, text })) : []).toEqual([
            { sourceId: firstSource?.id, text: 'Paris.' },
        ]);
    });

    test('treats context without sources (includeSources: false) as not-rows, never as zero hits', () => {
        expect(decodeVectorQuerySources(capturedContextOnlyOutput)).toEqual({ kind: 'not-rows' });
    });

    test('decodes the store-error output as zero rows, because that is all the trace shows', () => {
        expect(decodeVectorQuerySources(capturedStoreErrorOutput)).toEqual({
            kind: 'rows',
            hits: [],
            truncatedItems: 0,
        });
    });

    test('parses the serializer marker after the kept sources', () => {
        const cutSources = 4;
        const decoded = decodeVectorQuerySources({
            ...capturedRowsOutput,
            sources: [...capturedRowsOutput.sources, `[…${cutSources} more items]`],
        });
        expect(decoded.kind === 'rows' ? [decoded.hits.length, decoded.truncatedItems] : []).toEqual([
            capturedRowsOutput.sources.length,
            cutSources,
        ]);
    });

    test('decodes a null score (how JSON stores NaN) as NaN', () => {
        const decoded = decodeVectorQuerySources({ relevantContext: [], sources: [{ ...firstSource, score: null }] });
        expect(decoded.kind === 'rows' && Number.isNaN(decoded.hits[0]?.score)).toBe(true);
    });

    test.each([
        ['a hit-list output', { hits: [] }],
        ['a source without an id', { relevantContext: [], sources: [{ score: 1, metadata: {}, document: '' }] }],
        ['a non-object output', 'no rows'],
    ])('treats %s as not-rows', (_label, output) => {
        expect(decodeVectorQuerySources(output)).toEqual({ kind: 'not-rows' });
    });
});
