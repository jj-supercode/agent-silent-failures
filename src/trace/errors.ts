import type { TraceLoadFailure } from './load-trace.ts';

const describeFailure = (failure: TraceLoadFailure): string => {
    switch (failure.kind) {
        case 'no-storage':
            return 'the Mastra instance has no storage configured';
        case 'no-observability-store':
            return 'the configured storage has no observability store';
        case 'not-found':
            return `trace ${failure.traceId} is not stored (was observability flushed before reading?)`;
        case 'in-progress':
            return `trace ${failure.traceId} is still running (${failure.openSpanCount} open spans); score it once it has finished`;
        case 'undecodable':
            return `trace ${failure.traceId} has spans of an unexpected shape: ${failure.issues}`;
        default:
            return failure satisfies never;
    }
};

export class TraceUnavailableError extends Error {
    override readonly name = 'TraceUnavailableError';
    readonly failure: TraceLoadFailure;

    constructor(failure: TraceLoadFailure) {
        super(describeFailure(failure));
        this.failure = failure;
    }
}
