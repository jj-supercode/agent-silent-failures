import { z } from 'zod';

export const traceIdSchema = z.string().min(1).brand<'TraceId'>();
export type TraceId = z.infer<typeof traceIdSchema>;

export const spanIdSchema = z.string().min(1).brand<'SpanId'>();
export type SpanId = z.infer<typeof spanIdSchema>;

export const chunkIdSchema = z.string().min(1).brand<'ChunkId'>();
export type ChunkId = z.infer<typeof chunkIdSchema>;

/** What a retrieved chunk is attributed to. Defined here so detectors can name it; the corpus imports it. */
export const sourceIdSchema = z.string().min(1).brand<'SourceId'>();
export type SourceId = z.infer<typeof sourceIdSchema>;

export const agentIdSchema = z.string().min(1).brand<'AgentId'>();
export type AgentId = z.infer<typeof agentIdSchema>;

/** The key a supervisor registers a sub-agent under; Mastra offers it as the tool `agent-<key>`. Not the agent id. */
export const agentKeySchema = z.string().min(1).brand<'AgentKey'>();
export type AgentKey = z.infer<typeof agentKeySchema>;

export const toolNameSchema = z.string().min(1).brand<'ToolName'>();
export type ToolName = z.infer<typeof toolNameSchema>;

export const modelIdSchema = z.string().min(1).brand<'ModelId'>();
export type ModelId = z.infer<typeof modelIdSchema>;

/** Tokens as the embedder's tokenizer counts them. Kept apart from `CharCount`: mixing the two is the default-stack bug. */
export const tokenCountSchema = z.int().nonnegative().brand<'TokenCount'>();
export type TokenCount = z.infer<typeof tokenCountSchema>;

/** Characters, the unit `MDocument.chunk` sizes chunks in by default. */
export const charCountSchema = z.int().nonnegative().brand<'CharCount'>();
export type CharCount = z.infer<typeof charCountSchema>;

/** Chunks (or the vectors stored one per chunk), never tokens or characters. */
export const chunkCountSchema = z.int().nonnegative().brand<'ChunkCount'>();
export type ChunkCount = z.infer<typeof chunkCountSchema>;

/** A share, severity or probability in [0, 1]. */
export const unitIntervalSchema = z.number().min(0).max(1).brand<'UnitInterval'>();
export type UnitInterval = z.infer<typeof unitIntervalSchema>;

export type AgentRun = {
    readonly spanId: SpanId;
    readonly agentId: AgentId;
    /** `null` for the root run; a worker run points at the agent run that delegated to it. */
    readonly parentAgentRunSpanId: SpanId | null;
    readonly outputText: string;
    /**
     * The step budget, for frameworks that record one on the agent span. Always `null` on Mastra 1.77 traces, whose
     * `agent_run` spans carry only `instructions` and `availableTools`.
     */
    readonly maxSteps: number | null;
    readonly startedAt: Date;
};

export type ToolOutcome =
    { readonly kind: 'returned'; readonly value: unknown } | { readonly kind: 'threw'; readonly message: string };

export type ToolCall = {
    readonly spanId: SpanId;
    /** The nearest enclosing agent run: a worker's calls belong to the worker, never to its supervisor. */
    readonly ownerAgentRunSpanId: SpanId;
    readonly toolName: ToolName;
    readonly args: unknown;
    readonly outcome: ToolOutcome;
    readonly startedAt: Date;
};

/** A non-finite or missing score is kept as `NaN`, so it stays visible to score checks instead of being dropped. */
export type RetrievalHit = {
    readonly chunkId: ChunkId;
    readonly sourceId: SourceId;
    readonly score: number;
    readonly text: string;
};

export type RetrievedRows =
    | {
          readonly kind: 'rows';
          readonly hits: readonly RetrievalHit[];
          /** Rows the span serializer cut off (its array cap); they were returned to the agent but are not here. */
          readonly truncatedItems: number;
      }
    | { readonly kind: 'not-rows' };

/** A call to a declared retrieval tool. `not-rows` covers thrown calls and outputs of another shape (e.g. an error payload). */
export type RetrievalCall = ToolCall & { readonly retrieved: RetrievedRows };

export type WorkerToolResult = {
    readonly toolName: ToolName;
    readonly args: unknown;
    readonly result: unknown;
};

export type WorkerReply =
    | { readonly kind: 'replied'; readonly text: string; readonly toolResults: readonly WorkerToolResult[] }
    | { readonly kind: 'no-reply' };

export type Delegation = ToolCall & {
    readonly workerName: AgentKey;
    /** `null` when the delegation input carries no prompt string. */
    readonly prompt: string | null;
    readonly workerRunSpanId: SpanId | null;
    readonly reply: WorkerReply;
};

/** Everything a run canary may look at. Lists are in start order and include every depth of the span tree. */
export type RunView = {
    readonly traceId: TraceId;
    readonly rootAgentRun: AgentRun;
    readonly agentRuns: readonly AgentRun[];
    readonly toolCalls: readonly ToolCall[];
    readonly retrievals: readonly RetrievalCall[];
    readonly delegations: readonly Delegation[];
};

export const tokenCountStatsSchema = z.object({
    counter: z.string().min(1),
    limit: tokenCountSchema,
    totalTokens: tokenCountSchema,
    maxChunkTokens: tokenCountSchema,
    overLimitCount: chunkCountSchema,
    tokensBeyondLimit: tokenCountSchema,
});
export type TokenCountStats = z.infer<typeof tokenCountStatsSchema>;

export const vectorStatsSchema = z.object({
    zeroNormCount: z.int().nonnegative(),
    nonFiniteCount: z.int().nonnegative(),
    duplicateOfDistinctTextCount: z.int().nonnegative(),
});
export type VectorStats = z.infer<typeof vectorStatsSchema>;

/**
 * The output of an instrumented ingestion run (the `rag_ingestion` root span). Counts, not lists: the span
 * serializer caps arrays at 50 items, and a corpus has hundreds of chunks.
 */
export const ingestionReportSchema = z.object({
    indexName: z.string().min(1),
    embedder: z.object({ modelId: modelIdSchema, maxInputTokens: tokenCountSchema }),
    chunking: z.object({ strategy: z.string().min(1), maxSize: charCountSchema, overlap: charCountSchema }),
    documentCount: z.int().nonnegative(),
    chunkCount: chunkCountSchema,
    embeddedCount: chunkCountSchema,
    upsertedCount: chunkCountSchema,
    vectorCount: chunkCountSchema,
    tokenCounts: tokenCountStatsSchema,
    vectors: vectorStatsSchema,
});
export type IngestionReport = z.infer<typeof ingestionReportSchema>;

/** A chunking action as the RAG library itself recorded it, independent of what the pipeline reports. */
export type ChunkAction = {
    readonly spanId: SpanId;
    readonly strategy: string | null;
    readonly maxSize: CharCount | null;
    readonly overlap: CharCount | null;
    readonly chunkCount: ChunkCount;
};

export type IngestionView = {
    readonly traceId: TraceId;
    readonly rootSpanId: SpanId;
    readonly report: IngestionReport;
    readonly chunkActions: readonly ChunkAction[];
};
