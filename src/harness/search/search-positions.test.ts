import { RequestContext } from '@mastra/core/request-context';
import { describe, expect, test } from 'vitest';

import { createSearchPositions, ensureSearchPositions, searchPositionsKey } from './search-positions.ts';

describe('createSearchPositions', () => {
    test('hands out 0-based positions in the order they are asked for', () => {
        const nextPosition = createSearchPositions();
        expect([nextPosition(), nextPosition(), nextPosition()]).toEqual([0, 1, 2]);
    });

    test('each run gets its own sequence', () => {
        const first = createSearchPositions();
        first();
        expect(createSearchPositions()()).toBe(0);
    });
});

describe('ensureSearchPositions', () => {
    test('reads the positions the run edge stored', () => {
        const stored = createSearchPositions();
        stored();
        const requestContext = new RequestContext<unknown>([[searchPositionsKey, stored]]);
        expect(ensureSearchPositions(requestContext)()).toBe(1);
    });

    test('stores new positions in a context that arrived without them, so later searches continue them', () => {
        const requestContext = new RequestContext();
        expect(ensureSearchPositions(requestContext)()).toBe(0);
        expect(ensureSearchPositions(requestContext)()).toBe(1);
    });

    test('replaces a value a client sent under the key, since JSON never holds a function', () => {
        const requestContext = new RequestContext<unknown>([[searchPositionsKey, { issued: 7 }]]);
        expect(ensureSearchPositions(requestContext)()).toBe(0);
    });

    test('never reaches a span: the serialized context leaves the positions out', () => {
        const requestContext = new RequestContext<unknown>([
            ['scenario', 'kept'],
            [searchPositionsKey, createSearchPositions()],
        ]);
        expect(requestContext.toJSON()).toEqual({ scenario: 'kept' });
    });

    test('a copy of the context entries, as Mastra makes for a worker, continues the same sequence', () => {
        const parent = new RequestContext<unknown>([[searchPositionsKey, createSearchPositions()]]);
        const worker = new RequestContext<unknown>(parent.entries());
        expect([
            ensureSearchPositions(parent)(),
            ensureSearchPositions(worker)(),
            ensureSearchPositions(parent)(),
        ]).toEqual([0, 1, 2]);
    });
});
