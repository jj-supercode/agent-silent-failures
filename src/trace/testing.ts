import { decodeHitList, type RetrievedRowsDecoder } from './retrieved-rows.ts';
import {
    chunkIdSchema,
    sourceIdSchema,
    spanIdSchema,
    toolNameSchema,
    traceIdSchema,
    type RetrievalHit,
    type SpanId,
    type ToolName,
} from './model.ts';
import type { SpanRecord } from './span-record.ts';
import { delegationToolPrefix, spanTypes } from './span-types.ts';

/**
 * Sample generators for tests: span trees shaped like Mastra's (agent_run > model_generation > model_step >
 * tool_call, a sub-agent as `tool_call 'agent-<name>' > agent_run`), with deterministic ids and start times.
 */

export const sampleTraceId = traceIdSchema.parse('trace-sample');
const sampleEpoch = Date.UTC(2026, 9, 14);

export type ToolCallSample = {
    readonly toolName: string;
    readonly args: unknown;
    readonly result: { readonly returned: unknown } | { readonly threw: string };
};

export type DelegationSample = {
    readonly workerName: string;
    readonly prompt: string;
    readonly worker: AgentRunSample;
};

export type AgentRunSample = {
    readonly agentId: string;
    readonly outputText: string;
    readonly maxSteps?: number;
    readonly steps: readonly (ToolCallSample | DelegationSample)[];
};

type SpanDraft = Pick<SpanRecord, 'parentSpanId' | 'name' | 'spanType' | 'entityId'> & {
    readonly attributes?: Readonly<Record<string, unknown>>;
    readonly input?: unknown;
    readonly output?: unknown;
    readonly error?: unknown;
    /** Defaults to finished at its start time; `null` makes an in-flight span. */
    readonly endedAt?: Date | null;
};

const toSpanRecord = (draft: SpanDraft, spanId: SpanId, startedAt: Date): SpanRecord => ({
    traceId: sampleTraceId,
    spanId,
    parentSpanId: draft.parentSpanId,
    name: draft.name,
    spanType: draft.spanType,
    entityId: draft.entityId,
    startedAt,
    endedAt: draft.endedAt === undefined ? startedAt : draft.endedAt,
    isEvent: false,
    attributes: { ...draft.attributes },
    input: draft.input,
    output: draft.output,
    error: draft.error,
});

type TreeBuilder = { readonly spans: readonly SpanRecord[] };

const appendSpan = (tree: TreeBuilder, draft: SpanDraft): { tree: TreeBuilder; spanId: SpanId } => {
    const spanId = spanIdSchema.parse(`span-${tree.spans.length + 1}`);
    const span = toSpanRecord(draft, spanId, new Date(sampleEpoch + tree.spans.length));
    return { tree: { spans: [...tree.spans, span] }, spanId };
};

const isDelegation = (step: ToolCallSample | DelegationSample): step is DelegationSample => 'workerName' in step;

const workerReply = (worker: AgentRunSample) => ({
    text: worker.outputText,
    subAgentToolResults: worker.steps.flatMap((step) =>
        !isDelegation(step) && 'returned' in step.result
            ? [{ toolName: step.toolName, args: step.args, result: step.result.returned }]
            : [],
    ),
});

const appendStep = (tree: TreeBuilder, stepSpanId: SpanId, step: ToolCallSample | DelegationSample): TreeBuilder => {
    if (isDelegation(step)) {
        const call = appendSpan(tree, {
            parentSpanId: stepSpanId,
            name: `tool: '${delegationToolPrefix}${step.workerName}'`,
            spanType: spanTypes.toolCall,
            entityId: `${delegationToolPrefix}${step.workerName}`,
            input: { prompt: step.prompt },
            output: workerReply(step.worker),
        });
        return appendAgentRun(call.tree, call.spanId, step.worker);
    }
    return appendSpan(tree, {
        parentSpanId: stepSpanId,
        name: `tool: '${step.toolName}'`,
        spanType: spanTypes.toolCall,
        entityId: step.toolName,
        input: step.args,
        ...('returned' in step.result ? { output: step.result.returned } : { error: { message: step.result.threw } }),
    }).tree;
};

const appendAgentRun = (tree: TreeBuilder, parentSpanId: SpanId | null, run: AgentRunSample): TreeBuilder => {
    const agent = appendSpan(tree, {
        parentSpanId,
        name: `agent run: '${run.agentId}'`,
        spanType: spanTypes.agentRun,
        entityId: run.agentId,
        output: { text: run.outputText },
        ...(run.maxSteps === undefined ? {} : { attributes: { maxSteps: run.maxSteps } }),
    });
    const generation = appendSpan(agent.tree, {
        parentSpanId: agent.spanId,
        name: `llm: '${run.agentId}-model'`,
        spanType: 'model_generation',
        entityId: run.agentId,
    });
    return run.steps.reduce((current, step, index) => {
        const modelStep = appendSpan(current, {
            parentSpanId: generation.spanId,
            name: `step: ${index}`,
            spanType: 'model_step',
            entityId: run.agentId,
        });
        return appendStep(modelStep.tree, modelStep.spanId, step);
    }, generation.tree);
};

export const sampleAgentRunSpans = (run: AgentRunSample): readonly SpanRecord[] =>
    appendAgentRun({ spans: [] }, null, run).spans;

/** A workflow run whose steps each call one agent: `workflow_run > workflow_step > agent_run`, as Mastra 1.77 stores it. */
export const sampleWorkflowSpans = (
    workflowId: string,
    agentSteps: readonly AgentRunSample[],
): readonly SpanRecord[] => {
    const workflow = appendSpan(
        { spans: [] },
        {
            parentSpanId: null,
            name: `workflow run: '${workflowId}'`,
            spanType: spanTypes.workflowRun,
            entityId: workflowId,
        },
    );
    return agentSteps.reduce((current, run, index) => {
        const step = appendSpan(current, {
            parentSpanId: workflow.spanId,
            name: `workflow step: 'ask-${index}'`,
            spanType: 'workflow_step',
            entityId: `ask-${index}`,
        });
        return appendAgentRun(step.tree, step.spanId, run);
    }, workflow.tree).spans;
};

/** `count` hits from `count` distinct sources, scored by `scoreAt(rank)` (rank 0 is the top row). */
export const sampleHits = (count: number, scoreAt: (rank: number) => number): readonly RetrievalHit[] =>
    Array.from({ length: count }, (_, rank) => ({
        chunkId: chunkIdSchema.parse(`source-${rank}#0`),
        sourceId: sourceIdSchema.parse(`source-${rank}`),
        score: scoreAt(rank),
        text: `Passage ${rank} of the sample corpus.`,
    }));

/** A score ladder from 0.9 down in steps of 0.1, the shape of a healthy dense retrieval. */
export const descendingScore = (rank: number): number => 0.9 - rank / 10;

/** A single span for hand-built trees; `startOffset` is milliseconds after the sample epoch. */
export const sampleSpan = ({
    spanId,
    startOffset,
    ...draft
}: SpanDraft & { readonly spanId: string; readonly startOffset: number }): SpanRecord =>
    toSpanRecord(draft, spanIdSchema.parse(spanId), new Date(sampleEpoch + startOffset));

export const sampleRetrievalToolName = toolNameSchema.parse('searchCorpus');

/** Run-view options declaring one retrieval tool with the hit-list shape. */
export const sampleRetrievalTools = (
    toolName: ToolName = sampleRetrievalToolName,
): ReadonlyMap<ToolName, RetrievedRowsDecoder> => new Map([[toolName, decodeHitList]]);
