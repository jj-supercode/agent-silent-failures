import { setTimeout } from 'node:timers/promises';

import type { Mastra } from '@mastra/core/mastra';

import { loadTraceSpans, type TraceId } from '../trace/index.ts';
import { flushObservability } from './harness-mastra.ts';

/** Trace export is asynchronous even after a flush resolves, so readiness is confirmed by reading the trace back. */
const traceReadAttempts = 20;
const traceReadDelayMilliseconds = 25;

export const awaitStoredTrace = async (mastra: Mastra, traceId: TraceId, attempt = 1): Promise<boolean> => {
    await flushObservability(mastra);
    if ((await loadTraceSpans(mastra, traceId)).kind === 'loaded') {
        return true;
    }
    if (attempt >= traceReadAttempts) {
        return false;
    }
    await setTimeout(traceReadDelayMilliseconds * attempt);
    return awaitStoredTrace(mastra, traceId, attempt + 1);
};
