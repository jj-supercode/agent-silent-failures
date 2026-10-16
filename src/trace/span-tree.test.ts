import { describe, expect, test } from 'vitest';

import { spanIdSchema } from './model.ts';
import { ancestorsOf, nearestAncestorOfType, toSpanTree } from './span-tree.ts';
import { sampleSpan } from './testing.ts';

const span = (spanId: string, parentSpanId: string | null, spanType: string) =>
    sampleSpan({
        spanId,
        startOffset: 0,
        parentSpanId: parentSpanId === null ? null : spanIdSchema.parse(parentSpanId),
        name: spanId,
        spanType,
        entityId: null,
    });

describe('ancestorsOf', () => {
    test('lists the parent first and the root last', () => {
        const tree = toSpanTree([
            span('root', null, 'agent_run'),
            span('step', 'root', 'model_step'),
            span('tool', 'step', 'tool_call'),
        ]);
        const tool = tree.byId.get(spanIdSchema.parse('tool'));
        expect(tool === undefined ? [] : ancestorsOf(tree, tool).map((ancestor) => ancestor.spanId)).toEqual([
            'step',
            'root',
        ]);
    });

    test('ends the walk at a parent cycle instead of looping', () => {
        const tree = toSpanTree([span('first', 'second', 'agent_run'), span('second', 'first', 'tool_call')]);
        const first = tree.byId.get(spanIdSchema.parse('first'));
        expect(first === undefined ? [] : ancestorsOf(tree, first).map((ancestor) => ancestor.spanId)).toEqual([
            'second',
        ]);
    });

    test('finds the nearest ancestor of a type', () => {
        const tree = toSpanTree([
            span('outer', null, 'agent_run'),
            span('delegation', 'outer', 'tool_call'),
            span('inner', 'delegation', 'agent_run'),
            span('tool', 'inner', 'tool_call'),
        ]);
        const tool = tree.byId.get(spanIdSchema.parse('tool'));
        expect(tool === undefined ? undefined : nearestAncestorOfType(tree, tool, 'agent_run')?.spanId).toBe('inner');
    });
});
