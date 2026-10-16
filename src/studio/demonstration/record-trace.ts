import type { Mastra } from '@mastra/core/mastra';

import { sanitizeTrace, type RecordedRunInput } from '../../record/index.ts';
import { loadTraceSpans, type TraceId } from '../../trace/index.ts';

/** A stored trace as a fixture records it: the sanitized skeleton detectors read, or why it could not be read. */
export const recordedTraceOutcome = async (mastra: Mastra, traceId: TraceId): Promise<RecordedRunInput['outcome']> => {
    const loaded = await loadTraceSpans(mastra, traceId);
    return loaded.kind === 'loaded'
        ? { kind: 'completed', trace: { traceId, spans: sanitizeTrace(loaded.spans) }, judgement: null }
        : { kind: 'failed', reason: `the stored trace could not be read: ${loaded.failure.kind}` };
};
