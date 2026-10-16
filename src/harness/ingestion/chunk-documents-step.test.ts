import { describe, expect, test } from 'vitest';

import { sourceIdSchema } from '../../trace/index.ts';
import { withChunkIds } from './chunk-documents-step.ts';

const first = sourceIdSchema.parse('Treasure Island');
const second = sourceIdSchema.parse('Robert Louis Stevenson');

describe('withChunkIds', () => {
    test('numbers chunks per source in chunk order, wherever the sources interleave', () => {
        const ids = withChunkIds([
            { sourceId: first, text: 'a' },
            { sourceId: second, text: 'b' },
            { sourceId: first, text: 'c' },
            { sourceId: first, text: 'd' },
            { sourceId: second, text: 'e' },
        ]).map((chunk) => chunk.chunkId);
        expect(ids).toEqual([
            'Treasure Island#0',
            'Robert Louis Stevenson#0',
            'Treasure Island#1',
            'Treasure Island#2',
            'Robert Louis Stevenson#1',
        ]);
    });

    test('an empty corpus has no chunks', () => {
        expect(withChunkIds([])).toEqual([]);
    });
});
