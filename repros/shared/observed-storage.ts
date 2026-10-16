import type { Mastra } from '@mastra/core/mastra';
import { InMemoryStore, type MastraCompositeStore, type TraceRecord } from '@mastra/core/storage';
import { MastraStorageExporter, Observability, type MastraStorageExporterConfig } from '@mastra/observability';

import { ReproSetupError } from './errors.ts';

type ObservedStorageOptions = {
    readonly serviceName: string;
    readonly exporterConfig?: MastraStorageExporterConfig;
    readonly storage?: MastraCompositeStore;
};

/** Storage plus observability that persists every span to it; spread into `new Mastra({ ... })`. */
export const observedStorage = ({
    serviceName,
    exporterConfig = {},
    storage = new InMemoryStore(),
}: ObservedStorageOptions) => ({
    storage,
    observability: new Observability({
        configs: { default: { serviceName, exporters: [new MastraStorageExporter(exporterConfig)] } },
    }),
});

const settleAfterFlushMilliseconds = 300;

export const pause = (milliseconds: number): Promise<void> =>
    new Promise((resolve) => setTimeout(resolve, milliseconds));

/** Forces buffered spans into storage; without this a fresh trace is not readable yet. */
export const flushTraces = async (mastra: Mastra): Promise<void> => {
    await mastra.observability.getDefaultInstance()?.flush();
    await pause(settleAfterFlushMilliseconds);
};

export const loadTrace = async (mastra: Mastra, traceId: string): Promise<TraceRecord | null> => {
    const observabilityStore = await mastra.getStorage()?.getStore('observability');
    return (await observabilityStore?.getTrace({ traceId })) ?? null;
};

/** The trace id of a finished run; a run without one cannot be observed, so the repro stops as broken. */
export const requireTraceId = (run: { readonly traceId?: string | undefined }): string => {
    if (run.traceId === undefined || run.traceId.length === 0) {
        throw new ReproSetupError('the run returned no trace id');
    }
    return run.traceId;
};

/** A trace that must already be stored (after `flushTraces`). */
export const requireStoredTrace = async (mastra: Mastra, traceId: string): Promise<TraceRecord> => {
    const trace = await loadTrace(mastra, traceId);
    if (trace === null) {
        throw new ReproSetupError(`trace ${traceId} is not stored after a flush`);
    }
    return trace;
};
