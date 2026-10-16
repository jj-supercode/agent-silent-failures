import type { SpanId } from './model.ts';
import type { SpanRecord } from './span-record.ts';

export type SpanTree = {
    readonly spans: readonly SpanRecord[];
    readonly byId: ReadonlyMap<SpanId, SpanRecord>;
};

export const toSpanTree = (spans: readonly SpanRecord[]): SpanTree => ({
    spans,
    byId: new Map(spans.map((span) => [span.spanId, span])),
});

export const rootSpans = (tree: SpanTree): readonly SpanRecord[] =>
    tree.spans.filter((span) => span.parentSpanId === null);

/** Spans whose parent id points outside the trace: a partial export or a cut trace. */
export const orphanSpans = (tree: SpanTree): readonly SpanRecord[] =>
    tree.spans.filter((span) => span.parentSpanId !== null && !tree.byId.has(span.parentSpanId));

const parentOf = (tree: SpanTree, span: SpanRecord): SpanRecord | undefined =>
    span.parentSpanId === null ? undefined : tree.byId.get(span.parentSpanId);

/** Parent first, root last; stops at a missing parent or at a span already seen, so a corrupt cycle ends the walk. */
const ancestorsAvoiding = (tree: SpanTree, span: SpanRecord, seen: ReadonlySet<SpanId>): readonly SpanRecord[] => {
    const parent = parentOf(tree, span);
    return parent === undefined || seen.has(parent.spanId)
        ? []
        : [parent, ...ancestorsAvoiding(tree, parent, new Set([...seen, parent.spanId]))];
};

export const ancestorsOf = (tree: SpanTree, span: SpanRecord): readonly SpanRecord[] =>
    ancestorsAvoiding(tree, span, new Set([span.spanId]));

export const nearestAncestorOfType = (tree: SpanTree, span: SpanRecord, spanType: string): SpanRecord | undefined =>
    ancestorsOf(tree, span).find((ancestor) => ancestor.spanType === spanType);

export const childrenOfType = (tree: SpanTree, parent: SpanRecord, spanType: string): readonly SpanRecord[] =>
    tree.spans.filter((span) => span.parentSpanId === parent.spanId && span.spanType === spanType);

/** Start order; spans that start in the same millisecond keep their stored order. */
export const byStartTime = (left: { readonly startedAt: Date }, right: { readonly startedAt: Date }): number =>
    left.startedAt.getTime() - right.startedAt.getTime();
