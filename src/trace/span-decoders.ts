import {
    agentIdSchema,
    agentKeySchema,
    toolNameSchema,
    type AgentKey,
    type AgentRun,
    type Delegation,
    type RetrievalCall,
    type SpanId,
    type ToolCall,
    type ToolOutcome,
    type ToolName,
    type WorkerReply,
} from './model.ts';
import type { RetrievedRowsDecoder } from './retrieved-rows.ts';
import { spanPayloadSchemas } from './span-payloads.ts';
import type { SpanRecord } from './span-record.ts';
import { childrenOfType, nearestAncestorOfType, type SpanTree } from './span-tree.ts';
import { delegationToolPrefix, spanTypes } from './span-types.ts';

/** Mastra puts the agent or tool id in `entityId`; the span name is the fallback for traces that omit it. */
const identityOf = (span: SpanRecord): string => span.entityId ?? span.name;

const ranSubAgent = (tree: SpanTree, span: SpanRecord): boolean =>
    childrenOfType(tree, span, spanTypes.agentRun).length > 0 ||
    spanPayloadSchemas.delegation.subAgentOutput.safeParse(span.output).success;

/**
 * A delegation is an `agent-<key>` tool call that actually ran a sub-agent (a worker `agent_run` child, or Mastra's
 * `subAgentThreadId` in its output when sub-agent spans are not exported). The name alone could be an ordinary tool.
 */
export const delegationWorker = (tree: SpanTree, span: SpanRecord, toolName: ToolName): AgentKey | null =>
    toolName.startsWith(delegationToolPrefix) && ranSubAgent(tree, span)
        ? (agentKeySchema.safeParse(toolName.slice(delegationToolPrefix.length)).data ?? null)
        : null;

export const toAgentRun = (tree: SpanTree, span: SpanRecord): AgentRun => ({
    spanId: span.spanId,
    agentId: agentIdSchema.parse(identityOf(span)),
    parentAgentRunSpanId: nearestAncestorOfType(tree, span, spanTypes.agentRun)?.spanId ?? null,
    outputText: spanPayloadSchemas.agentRun.output.safeParse(span.output).data?.text ?? '',
    maxSteps: spanPayloadSchemas.agentRun.attributes.safeParse(span.attributes).data?.maxSteps ?? null,
    startedAt: span.startedAt,
});

/** A thrown error's message; a bare string error is its own message. */
const errorMessage = (error: unknown): string =>
    typeof error === 'string'
        ? error
        : (spanPayloadSchemas.toolCall.error.safeParse(error).data?.message ?? JSON.stringify(error));

const toOutcome = (span: SpanRecord): ToolOutcome =>
    span.error === undefined || span.error === null
        ? { kind: 'returned', value: span.output }
        : { kind: 'threw', message: errorMessage(span.error) };

export const toToolCall = (span: SpanRecord, ownerAgentRunSpanId: SpanId): ToolCall => ({
    spanId: span.spanId,
    ownerAgentRunSpanId,
    toolName: toolNameSchema.parse(identityOf(span)),
    args: span.input,
    outcome: toOutcome(span),
    startedAt: span.startedAt,
});

const toWorkerReply = (call: ToolCall): WorkerReply => {
    const output =
        call.outcome.kind === 'returned'
            ? spanPayloadSchemas.delegation.output.safeParse(call.outcome.value)
            : undefined;
    return output?.success === true
        ? { kind: 'replied', text: output.data.text, toolResults: output.data.subAgentToolResults }
        : { kind: 'no-reply' };
};

export const toDelegation = (tree: SpanTree, span: SpanRecord, call: ToolCall, workerName: AgentKey): Delegation => ({
    ...call,
    workerName,
    prompt: spanPayloadSchemas.delegation.input.safeParse(call.args).data?.prompt ?? null,
    workerRunSpanId: childrenOfType(tree, span, spanTypes.agentRun)[0]?.spanId ?? null,
    reply: toWorkerReply(call),
});

export const toRetrievalCall = (call: ToolCall, decode: RetrievedRowsDecoder): RetrievalCall => ({
    ...call,
    retrieved: call.outcome.kind === 'returned' ? decode(call.outcome.value) : { kind: 'not-rows' },
});
