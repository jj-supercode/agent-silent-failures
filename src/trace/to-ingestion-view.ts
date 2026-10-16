import { z } from 'zod';

import type { ChunkAction, IngestionView } from './model.ts';
import { spanPayloadSchemas } from './span-payloads.ts';
import type { SpanRecord } from './span-record.ts';
import { byStartTime, orphanSpans, rootSpans, toSpanTree } from './span-tree.ts';
import { spanTypes } from './span-types.ts';

export type IngestionViewResult =
    | { readonly kind: 'ingestion'; readonly view: IngestionView }
    | { readonly kind: 'not-an-ingestion'; readonly reason: string };

const toChunkAction = (span: SpanRecord): readonly ChunkAction[] => {
    const attributes = spanPayloadSchemas.ragAction.attributes.safeParse(span.attributes);
    const output = spanPayloadSchemas.ragAction.output.safeParse(span.output);
    return attributes.success && output.success
        ? [
              {
                  spanId: span.spanId,
                  strategy: attributes.data.strategy ?? null,
                  maxSize: attributes.data.chunkSize ?? null,
                  overlap: attributes.data.chunkOverlap ?? null,
                  chunkCount: output.data.chunkCount,
              },
          ]
        : [];
};

/** Builds the view of one instrumented ingestion run: a `rag_ingestion` root whose output is an ingestion report. */
export const toIngestionView = (spans: readonly SpanRecord[]): IngestionViewResult => {
    const tree = toSpanTree(spans);
    const roots = rootSpans(tree);
    const [root] = roots;
    if (roots.length !== 1 || root === undefined || root.spanType !== spanTypes.ragIngestion) {
        return { kind: 'not-an-ingestion', reason: `expected one ${spanTypes.ragIngestion} root span` };
    }
    const orphans = orphanSpans(tree);
    if (orphans.length > 0) {
        return { kind: 'not-an-ingestion', reason: `${orphans.length} spans point at parents missing from the trace` };
    }
    const report = spanPayloadSchemas.ragIngestion.output.safeParse(root.output);
    if (!report.success) {
        return {
            kind: 'not-an-ingestion',
            reason: `root output is not an ingestion report: ${z.prettifyError(report.error)}`,
        };
    }
    return {
        kind: 'ingestion',
        view: {
            traceId: root.traceId,
            rootSpanId: root.spanId,
            report: report.data,
            chunkActions: tree.spans
                .filter((span) => span.spanType === spanTypes.ragAction)
                .toSorted(byStartTime)
                .flatMap(toChunkAction),
        },
    };
};
