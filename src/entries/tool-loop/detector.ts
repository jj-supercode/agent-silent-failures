import { salientTokenList } from '../../text/salient-tokens.ts';
import { clusterBy, largestCluster, longestAlternation, type AlternationRule } from '../../text/sequence-patterns.ts';
import { jaccard, sameMembers } from '../../text/similarity.ts';
import { terms } from '../../text/terms.ts';
import { callFailed } from '../../text/tool-failures.ts';
import { unitIntervalSchema, type AgentRun, type RunView, type SpanId, type ToolCall } from '../../trace/model.ts';
import { assumedStepBudget, type Detector, type ToolLoopThresholds, type Verdict } from './model.ts';

type Canonical = string | number | boolean | null | readonly Canonical[] | { readonly [key: string]: Canonical };

/** Sorted keys, strings lower-cased with whitespace collapsed: formatting noise never makes two calls differ. */
const canonical = (value: unknown): Canonical => {
    if (typeof value === 'string') {
        return value.toLowerCase().replaceAll(/\s+/g, ' ').trim();
    }
    if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
        return value;
    }
    if (Array.isArray(value)) {
        return value.map(canonical);
    }
    if (typeof value === 'object') {
        return Object.fromEntries(
            Object.entries(value)
                .toSorted(([left], [right]) => (left < right ? -1 : left > right ? 1 : 0))
                .map(([key, field]) => [key, canonical(field)]),
        );
    }
    return null;
};

const canonicalText = (args: unknown): string => JSON.stringify(canonical(args));

/** The one free-text field of an argument object, and the rest of it; `null` unless exactly one field is a string. */
const splitFreeText = (args: unknown): { readonly text: string; readonly rest: string } | null => {
    if (typeof args !== 'object' || args === null || Array.isArray(args)) {
        return null;
    }
    const entries = Object.entries(args);
    const textEntries = entries.filter(([, field]) => typeof field === 'string');
    const [textEntry] = textEntries;
    return textEntry === undefined || textEntries.length !== 1 || typeof textEntry[1] !== 'string'
        ? null
        : {
              text: textEntry[1],
              rest: canonicalText({
                  freeTextField: textEntry[0],
                  otherFields: Object.fromEntries(entries.filter(([key]) => key !== textEntry[0])),
              }),
          };
};

/** The terms of a text that name something: its salient tokens (names, numbers, quoted words) as terms. */
const namingTerms = (text: string): ReadonlySet<string> => terms(salientTokenList(text).join(' '));

/** True when the two texts differ only in ordinary words: a changed name or number makes a different call. */
const differOnlyInWording = (left: string, right: string): boolean =>
    terms(left)
        .symmetricDifference(terms(right))
        .isDisjointFrom(namingTerms(left).union(namingTerms(right)));

/**
 * 1 for canonically equal arguments. Otherwise, when both have one free-text field, are equal elsewhere and differ
 * only in ordinary words (never in a name or number), the Jaccard of that field's terms; queries shorter than
 * `MIN_QUERY_TERMS` count only with identical terms. Else 0, so a call that differs only by a page number, or asks
 * the same question about another entity, is never a repeat.
 */
const argSimilarity = (left: unknown, right: unknown, thresholds: ToolLoopThresholds): number => {
    if (canonicalText(left) === canonicalText(right)) {
        return 1;
    }
    const leftText = splitFreeText(left);
    const rightText = splitFreeText(right);
    if (
        leftText === null ||
        rightText === null ||
        leftText.rest !== rightText.rest ||
        !differOnlyInWording(leftText.text, rightText.text)
    ) {
        return 0;
    }
    const leftTerms = terms(leftText.text);
    const rightTerms = terms(rightText.text);
    const shortQuery = Math.min(leftTerms.size, rightTerms.size) < thresholds.MIN_QUERY_TERMS.value;
    return shortQuery ? (sameMembers(leftTerms, rightTerms) ? 1 : 0) : jaccard(leftTerms, rightTerms);
};

const sameCall = (left: ToolCall, right: ToolCall, thresholds: ToolLoopThresholds): boolean =>
    left.toolName === right.toolName &&
    argSimilarity(left.args, right.args, thresholds) >= thresholds.ARG_SIMILARITY.value;

const alternatingCalls = (thresholds: ToolLoopThresholds): AlternationRule<ToolCall> => ({
    differs: (previous, call) => !sameCall(previous, call, thresholds),
    repeats: (twoBack, call) => sameCall(twoBack, call, thresholds),
});

/** `retriesBefore`: which retry of its streak the call is (0 when it is not a retry); `streakRetries`: the streak's total. */
type RetryStreak = { readonly retriesBefore: number; readonly streakRetries: number };

/**
 * The retries in the streak a call belongs to: among the run's calls that match it, in order, a streak starts at a
 * failed call and goes on while the call before failed, so it ends at the first usable result.
 */
const retryStreakOf = (call: ToolCall, calls: readonly ToolCall[], thresholds: ToolLoopThresholds): RetryStreak => {
    const matching = calls.filter((other) => sameCall(other, call, thresholds));
    const position = matching.indexOf(call);
    const failedBefore = matching
        .slice(0, position)
        .toReversed()
        .findIndex((previous) => !callFailed(previous));
    const retriesBefore = failedBefore === -1 ? position : failedBefore;
    const firstUsableFromHere = matching.slice(position).findIndex((later) => !callFailed(later));
    const retriesAfter = firstUsableFromHere === -1 ? matching.length - 1 - position : firstUsableFromHere;
    return { retriesBefore, streakRetries: retriesBefore + retriesAfter };
};

/**
 * A call that re-issues a failed call is a retry, not a repeat: an agent that meets an error and tries again is
 * behaving correctly. A streak of at most `MAX_RETRIES` retries is left out of the loop count; a longer streak counts
 * in full, as does every repeat after a usable result.
 */
const isRetryWithinBudget = (call: ToolCall, calls: readonly ToolCall[], thresholds: ToolLoopThresholds): boolean => {
    const { retriesBefore, streakRetries } = retryStreakOf(call, calls, thresholds);
    return retriesBefore >= 1 && streakRetries <= thresholds.MAX_RETRIES.value;
};

const withoutRetries = (calls: readonly ToolCall[], thresholds: ToolLoopThresholds): readonly ToolCall[] =>
    calls.filter((call) => !isRetryWithinBudget(call, calls, thresholds));

type Loop = {
    readonly agentRun: AgentRun;
    readonly kind: 'repeats' | 'cycle';
    readonly calls: readonly ToolCall[];
};

/** The worst loop in one agent run's own calls, retries within budget left out, if it reaches a threshold. */
const loopInRun = (agentRun: AgentRun, ownCalls: readonly ToolCall[], thresholds: ToolLoopThresholds): Loop | null => {
    const calls = withoutRetries(ownCalls, thresholds);
    const byTool = Map.groupBy(calls, (call) => call.toolName);
    const repeats = largestCluster(
        [...byTool.values()].flatMap((toolCalls) =>
            clusterBy(toolCalls, (reference, call) => sameCall(reference, call, thresholds)),
        ),
    );
    if (repeats.length >= thresholds.MIN_REPEATS.value) {
        return { agentRun, kind: 'repeats', calls: repeats };
    }
    const cycle = longestAlternation(calls, alternatingCalls(thresholds));
    return Math.floor(cycle.length / 2) >= thresholds.MIN_CYCLES.value
        ? { agentRun, kind: 'cycle', calls: cycle }
        : null;
};

/** Calls beyond the first two (a call plus one retry) over the steps beyond those two. */
const loopSeverity = (loop: Loop) => {
    const budget = Math.max(loop.agentRun.maxSteps ?? assumedStepBudget, loop.calls.length);
    return unitIntervalSchema.parse(budget <= 2 ? 1 : Math.min(1, Math.max(0, (loop.calls.length - 2) / (budget - 2))));
};

const describeLoop = (loop: Loop, thresholds: ToolLoopThresholds): string => {
    const tools = [...new Set(loop.calls.map((call) => call.toolName))].join(' and ');
    return loop.kind === 'repeats'
        ? `${loop.agentRun.agentId} called ${tools} ${loop.calls.length} times with near-identical arguments (similarity >= ${thresholds.ARG_SIMILARITY.value})`
        : `${loop.agentRun.agentId} alternated ${tools} for ${Math.floor(loop.calls.length / 2)} cycles with near-identical arguments`;
};

const clearSummary = (callsByRun: ReadonlyMap<SpanId, readonly ToolCall[]>, thresholds: ToolLoopThresholds): string => {
    const retries = [...callsByRun.values()].reduce(
        (total, calls) => total + calls.length - withoutRetries(calls, thresholds).length,
        0,
    );
    const runs = callsByRun.size === 1 ? 'the agent run' : `${callsByRun.size} agent runs`;
    const retryNote =
        retries === 0 ? '' : ` (${retries} ${retries === 1 ? 'retry' : 'retries'} of failed calls not counted)`;
    return `no tool call repeated ${thresholds.MIN_REPEATS.value} times or cycled in ${runs}${retryNote}`;
};

/** Delegations are another entry's concern (delegation-ping-pong); a worker's calls belong to the worker. */
const ownCallsByRun = (view: RunView): ReadonlyMap<SpanId, readonly ToolCall[]> => {
    const delegationSpans = new Set(view.delegations.map((delegation) => delegation.spanId));
    return Map.groupBy(
        view.toolCalls.filter((call) => !delegationSpans.has(call.spanId)),
        (call) => call.ownerAgentRunSpanId,
    );
};

/**
 * Fires when one agent run repeats a tool call with near-identical arguments at least `MIN_REPEATS` times
 * (adjacent or not), or alternates two different calls for `MIN_CYCLES` full cycles. Retries of failed calls, up to
 * `MAX_RETRIES` in a row, do not count: re-issuing two parallel searches that both failed is not an A-B-A-B cycle.
 */
export const detectToolLoop: Detector<RunView, ToolLoopThresholds> = (view, thresholds): Verdict => {
    const callsByRun = ownCallsByRun(view);
    if (callsByRun.size === 0) {
        return { kind: 'not-applicable', reason: 'the run made no tool calls other than delegations' };
    }
    const loops = view.agentRuns.flatMap(
        (agentRun) => loopInRun(agentRun, callsByRun.get(agentRun.spanId) ?? [], thresholds) ?? [],
    );
    const worst = loops.reduce<Loop | null>(
        (best, loop) => (best === null || loop.calls.length > best.calls.length ? loop : best),
        null,
    );
    if (worst === null) {
        return { kind: 'clear', evidence: { summary: clearSummary(callsByRun, thresholds) } };
    }
    return {
        kind: 'fired',
        severity: loopSeverity(worst),
        evidence: { spanIds: worst.calls.map((call) => call.spanId), summary: describeLoop(worst, thresholds) },
    };
};
