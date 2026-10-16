import { describe, expect, test } from 'vitest';

import { chunkedCorpusOfStep } from './chunked-corpus-of-step.ts';

const chunk = { chunkId: 'Treasure Island#0', sourceId: 'Treasure Island', text: 'A novel.', tokenCount: 5 };

describe('chunkedCorpusOfStep', () => {
    test('reads the chunks of a successful step', () => {
        const read = chunkedCorpusOfStep({ status: 'success', output: { documentCount: 1, chunks: [chunk] } });
        expect(read.kind === 'read' ? read.chunks.map((item) => item.chunkId) : []).toEqual(['Treasure Island#0']);
    });

    test('a malformed output is unreadable, never an empty chunk list', () => {
        expect(chunkedCorpusOfStep({ status: 'success', output: { chunks: 'none' } }).kind).toBe('unreadable');
    });

    test('a missing or failed step is unreadable', () => {
        expect(chunkedCorpusOfStep(undefined).kind).toBe('unreadable');
        expect(chunkedCorpusOfStep({ status: 'failed' }).kind).toBe('unreadable');
    });
});
