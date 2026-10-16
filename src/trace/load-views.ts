import { loadTraceSpans, type TraceLoadFailure, type TraceSource } from './load-trace.ts';
import type { IngestionView, RunView, TraceId } from './model.ts';
import { toIngestionView } from './to-ingestion-view.ts';
import { toRunView, toRunViews, type RunViewOptions } from './to-run-view.ts';

export type ViewLoadResult<TView> =
    | { readonly kind: 'loaded'; readonly view: TView }
    | { readonly kind: 'trace-unavailable'; readonly failure: TraceLoadFailure }
    | { readonly kind: 'wrong-shape'; readonly reason: string };

/** The view of a trace that ran exactly one agent at top level (see `toRunView`). */
export const loadRunView = async (
    source: TraceSource,
    traceId: TraceId,
    options: RunViewOptions,
): Promise<ViewLoadResult<RunView>> => {
    const loaded = await loadTraceSpans(source, traceId);
    if (loaded.kind === 'failed') {
        return { kind: 'trace-unavailable', failure: loaded.failure };
    }
    const mapped = toRunView(loaded.spans, options);
    return mapped.kind === 'run'
        ? { kind: 'loaded', view: mapped.view }
        : { kind: 'wrong-shape', reason: mapped.reason };
};

/** Every top-level agent run of the trace, each as its own view (see `toRunViews`). */
export const loadRunViews = async (
    source: TraceSource,
    traceId: TraceId,
    options: RunViewOptions,
): Promise<ViewLoadResult<readonly [RunView, ...RunView[]]>> => {
    const loaded = await loadTraceSpans(source, traceId);
    if (loaded.kind === 'failed') {
        return { kind: 'trace-unavailable', failure: loaded.failure };
    }
    const mapped = toRunViews(loaded.spans, options);
    return mapped.kind === 'runs'
        ? { kind: 'loaded', view: mapped.views }
        : { kind: 'wrong-shape', reason: mapped.reason };
};

export const loadIngestionView = async (
    source: TraceSource,
    traceId: TraceId,
): Promise<ViewLoadResult<IngestionView>> => {
    const loaded = await loadTraceSpans(source, traceId);
    if (loaded.kind === 'failed') {
        return { kind: 'trace-unavailable', failure: loaded.failure };
    }
    const mapped = toIngestionView(loaded.spans);
    return mapped.kind === 'ingestion'
        ? { kind: 'loaded', view: mapped.view }
        : { kind: 'wrong-shape', reason: mapped.reason };
};
