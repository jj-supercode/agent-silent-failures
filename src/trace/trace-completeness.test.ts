import { describe, expect, test } from 'vitest';

import { sampleSpan } from './testing.ts';
import { openSpans } from './trace-completeness.ts';

const finishedRoot = sampleSpan({
    spanId: 'root',
    startOffset: 0,
    parentSpanId: null,
    name: 'agent run',
    spanType: 'agent_run',
    entityId: 'agent',
});

describe('openSpans', () => {
    test('a finished trace has no open spans', () => {
        expect(openSpans([finishedRoot])).toEqual([]);
    });

    test('a root that has not ended is open: its output is not recorded yet', () => {
        const runningRoot = { ...finishedRoot, endedAt: null };
        expect(openSpans([runningRoot])).toEqual([runningRoot]);
    });

    test('an event span without an end is an instant, not an open span', () => {
        expect(openSpans([{ ...finishedRoot, endedAt: null, isEvent: true }])).toEqual([]);
    });
});
