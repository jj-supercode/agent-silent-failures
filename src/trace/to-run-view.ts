import type { RunView, ToolCall, ToolName } from './model.ts';
import type { RetrievedRowsDecoder } from './retrieved-rows.ts';
import { delegationWorker, toAgentRun, toDelegation, toRetrievalCall, toToolCall } from './span-decoders.ts';
import type { SpanRecord } from './span-record.ts';
import {
    ancestorsOf,
    byStartTime,
    nearestAncestorOfType,
    orphanSpans,
    rootSpans,
    toSpanTree,
    type SpanTree,
} from './span-tree.ts';
import { spanTypes, toolCallSpanTypes } from './span-types.ts';

export type RunViewOptions = {
    /** Tool name to row decoder. Calls to tools not listed here never count as retrievals. */
    readonly retrievalTools: ReadonlyMap<ToolName, RetrievedRowsDecoder>;
};

export type RunViewResult =
    { readonly kind: 'run'; readonly view: RunView } | { readonly kind: 'not-a-run'; readonly reason: string };

type OwnedToolSpan = { readonly span: SpanRecord; readonly call: ToolCall };

/** The agent run itself, or the outermost agent run above it: the agent a span's work is done for. */
const topAgentRunOf = (tree: SpanTree, span: SpanRecord): SpanRecord | undefined =>
    [span, ...ancestorsOf(tree, span)].findLast((candidate) => candidate.spanType === spanTypes.agentRun);

const ownedToolSpans = (tree: SpanTree, root: SpanRecord): readonly OwnedToolSpan[] =>
    tree.spans
        .filter((span) => toolCallSpanTypes.has(span.spanType) && topAgentRunOf(tree, span)?.spanId === root.spanId)
        .toSorted(byStartTime)
        .flatMap((span) => {
            const owner = nearestAncestorOfType(tree, span, spanTypes.agentRun);
            return owner === undefined ? [] : [{ span, call: toToolCall(span, owner.spanId) }];
        });

const runViewAt = (tree: SpanTree, root: SpanRecord, options: RunViewOptions): RunView => {
    const toolSpans = ownedToolSpans(tree, root);
    return {
        traceId: root.traceId,
        rootAgentRun: toAgentRun(tree, root),
        agentRuns: tree.spans
            .filter((span) => span.spanType === spanTypes.agentRun && topAgentRunOf(tree, span)?.spanId === root.spanId)
            .toSorted(byStartTime)
            .map((span) => toAgentRun(tree, span)),
        toolCalls: toolSpans.map(({ call }) => call),
        retrievals: toolSpans.flatMap(({ call }) => {
            const decode = options.retrievalTools.get(call.toolName);
            return decode === undefined ? [] : [toRetrievalCall(call, decode)];
        }),
        delegations: toolSpans.flatMap(({ span, call }) => {
            const workerName = delegationWorker(tree, span, call.toolName);
            return workerName === null ? [] : [toDelegation(tree, span, call, workerName)];
        }),
    };
};

/** Agent runs that no other agent run called, in start order: the trace root itself, or a workflow's agents. */
const topLevelAgentRuns = (tree: SpanTree, root: SpanRecord): readonly SpanRecord[] =>
    root.spanType === spanTypes.agentRun
        ? [root]
        : tree.spans
              .filter(
                  (span) =>
                      span.spanType === spanTypes.agentRun &&
                      nearestAncestorOfType(tree, span, spanTypes.agentRun) === undefined,
              )
              .toSorted(byStartTime);

const structuralProblem = (tree: SpanTree): string | null => {
    const roots = rootSpans(tree);
    const orphans = orphanSpans(tree);
    if (roots.length !== 1) {
        return `expected one root span, found ${roots.length}`;
    }
    return orphans.length > 0 ? `${orphans.length} spans point at parents missing from the trace` : null;
};

export type RunViewsResult =
    | { readonly kind: 'runs'; readonly views: readonly [RunView, ...RunView[]] }
    | { readonly kind: 'not-a-run'; readonly reason: string };

/**
 * One framework-neutral view per agent the trace ran at top level: the root `agent_run`, or, under a workflow root
 * (`workflow_run`, or any other non-agent root), every `agent_run` that no other agent run called, each with the
 * work nested under it. Refuses partial trees rather than guessing ownership.
 */
export const toRunViews = (spans: readonly SpanRecord[], options: RunViewOptions): RunViewsResult => {
    const tree = toSpanTree(spans);
    const problem = structuralProblem(tree);
    const [root] = rootSpans(tree);
    if (problem !== null || root === undefined) {
        return { kind: 'not-a-run', reason: problem ?? 'empty trace' };
    }
    const [first, ...rest] = topLevelAgentRuns(tree, root).map((agentRun) => runViewAt(tree, agentRun, options));
    return first === undefined
        ? { kind: 'not-a-run', reason: `the ${root.spanType} root ran no agent` }
        : { kind: 'runs', views: [first, ...rest] };
};

/** The view of a trace that ran exactly one agent at top level, directly or as a workflow step (see `toRunViews`). */
export const toRunView = (spans: readonly SpanRecord[], options: RunViewOptions): RunViewResult => {
    const mapped = toRunViews(spans, options);
    if (mapped.kind === 'not-a-run') {
        return mapped;
    }
    const [view, ...others] = mapped.views;
    return others.length === 0
        ? { kind: 'run', view }
        : { kind: 'not-a-run', reason: `the trace ran ${mapped.views.length} agents at top level; use toRunViews` };
};
