import type { ToolCall } from '../trace/model.ts';

const isRecord = (value: unknown): value is Readonly<Record<string, unknown>> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);

const hasText = (value: unknown): boolean => typeof value === 'string' && value.trim().length > 0;

/** `true`, an error message, or an error object with a message. `{ code: 0 }` and `false` say nothing failed. */
const signalsError = (error: unknown): boolean =>
    error === true || hasText(error) || (isRecord(error) && hasText(error['message']));

/**
 * Error-as-result shapes: MCP's `isError: true`; a top-level `error` that signals one (OpenAI Agents SDK style
 * messages, and Mastra's own `{ error: true, message }` when a tool's return fails its output schema); and
 * `success: false` only together with an error or a `message`, since `{ success: false, reason: 'already booked' }`
 * is a business answer the agent may rightly relay.
 */
export const isErrorResult = (value: unknown): boolean =>
    isRecord(value) &&
    (value['isError'] === true ||
        signalsError(value['error']) ||
        (value['success'] === false && hasText(value['message'])));

/** A call that threw, or returned an error-shaped result: the agent got nothing usable from it. */
export const callFailed = (call: Pick<ToolCall, 'outcome'>): boolean =>
    call.outcome.kind === 'threw' || isErrorResult(call.outcome.value);
