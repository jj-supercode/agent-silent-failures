/** Span type names as Mastra stores them (`SpanType` in `@mastra/core/observability`), kept as plain strings here. */
export const spanTypes = {
    agentRun: 'agent_run',
    toolCall: 'tool_call',
    mcpToolCall: 'mcp_tool_call',
    ragIngestion: 'rag_ingestion',
    ragAction: 'rag_action',
    workflowRun: 'workflow_run',
} as const;

export const toolCallSpanTypes: ReadonlySet<string> = new Set([spanTypes.toolCall, spanTypes.mcpToolCall]);

/** Mastra exposes a sub-agent registered under key `<name>` to its supervisor as the tool `agent-<name>`. */
export const delegationToolPrefix = 'agent-';
