import { acknowledgesFailure, type AnswerPhrasePattern } from '../../text/abstention.ts';
import { callFailed } from '../../text/tool-failures.ts';
import { unitIntervalSchema, type AgentRun, type RunView, type ToolCall } from '../../trace/model.ts';
import type { Detector, SwallowedToolErrorThresholds, Verdict } from './model.ts';

/** Failed calls with no later successful call to the same tool by the same agent run. */
const unrecoveredFailures = (calls: readonly ToolCall[]): readonly ToolCall[] =>
    calls.filter(
        (call, index) =>
            callFailed(call) &&
            !calls.slice(index + 1).some((later) => later.toolName === call.toolName && !callFailed(later)),
    );

type Swallowed = { readonly agentRun: AgentRun; readonly failures: readonly ToolCall[]; readonly callCount: number };

const swallowedIn = (
    agentRun: AgentRun,
    calls: readonly ToolCall[],
    extraAcknowledgementPatterns: readonly AnswerPhrasePattern[],
): Swallowed | null => {
    const failures = unrecoveredFailures(calls);
    const answered =
        agentRun.outputText.trim().length > 0 &&
        !acknowledgesFailure(agentRun.outputText, extraAcknowledgementPatterns);
    return failures.length > 0 && answered ? { agentRun, failures, callCount: calls.length } : null;
};

const describeSwallowed = (swallowed: readonly Swallowed[]): string =>
    swallowed
        .map(
            ({ agentRun, failures }) =>
                `${agentRun.agentId} answered without acknowledging ${failures.length === 1 ? 'a failed call' : `${failures.length} failed calls`} to ${[...new Set(failures.map((call) => call.toolName))].join(', ')} that it never retried successfully`,
        )
        .join('; ');

const clearSummary = (calls: readonly ToolCall[]): string => {
    const failures = calls.filter(callFailed).length;
    return failures === 0
        ? `no tool call failed (${calls.length} made)`
        : `${failures} of ${calls.length} tool calls failed; every failure was recovered, acknowledged or left unanswered`;
};

/**
 * Fires when an agent run's tool call failed (thrown, or an error-shaped result), no later call to that tool by the
 * same run succeeded, and that run still answered without abstaining or admitting the failure. Each agent judges
 * its own calls, so a worker that swallowed an error is caught even when its supervisor answers well.
 * `extraAcknowledgementPatterns` extends the shared phrases with an agent's own way of admitting a failure.
 */
export const createSwallowedToolErrorDetector =
    (extraAcknowledgementPatterns: readonly AnswerPhrasePattern[]): Detector<RunView, SwallowedToolErrorThresholds> =>
    (view): Verdict => {
        if (view.toolCalls.length === 0) {
            return { kind: 'not-applicable', reason: 'the run made no tool calls' };
        }
        const callsByRun = Map.groupBy(view.toolCalls, (call) => call.ownerAgentRunSpanId);
        const swallowed = view.agentRuns.flatMap(
            (agentRun) =>
                swallowedIn(agentRun, callsByRun.get(agentRun.spanId) ?? [], extraAcknowledgementPatterns) ?? [],
        );
        if (swallowed.length === 0) {
            return { kind: 'clear', evidence: { summary: clearSummary(view.toolCalls) } };
        }
        const failures = swallowed.flatMap((entry) => entry.failures);
        const callCount = swallowed.reduce((total, entry) => total + entry.callCount, 0);
        return {
            kind: 'fired',
            severity: unitIntervalSchema.parse(failures.length / callCount),
            evidence: { spanIds: failures.map((call) => call.spanId), summary: describeSwallowed(swallowed) },
        };
    };
