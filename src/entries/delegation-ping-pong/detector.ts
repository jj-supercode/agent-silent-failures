import { salientTokenList, salientTokens } from '../../text/salient-tokens.ts';
import { clusterBy, largestCluster, longestAlternation, type AlternationRule } from '../../text/sequence-patterns.ts';
import { jaccard, sameCounts } from '../../text/similarity.ts';
import { terms } from '../../text/terms.ts';
import { unitIntervalSchema, type AgentRun, type Delegation, type RunView } from '../../trace/model.ts';
import type { DelegationPingPongThresholds, Detector, Verdict } from './model.ts';

const promptOf = (delegation: Delegation): string => delegation.prompt ?? '';

const replyOf = (delegation: Delegation): string => (delegation.reply.kind === 'replied' ? delegation.reply.text : '');

/**
 * Same worker, the same salient tokens (entities, numbers, quotes) the same number of times, and wording within
 * `PROMPT_SIMILARITY`. Counting repeats keeps "look up A for: did A or B ..." apart from "look up B for: did A or B
 * ...": both name A and B, but not equally often.
 */
const sameTask = (reference: Delegation, delegation: Delegation, thresholds: DelegationPingPongThresholds): boolean =>
    reference.workerName === delegation.workerName &&
    sameCounts(salientTokenList(promptOf(reference)), salientTokenList(promptOf(delegation))) &&
    jaccard(terms(promptOf(reference)), terms(promptOf(delegation))) >= thresholds.PROMPT_SIMILARITY.value;

/**
 * Replies compare on the facts they name, so a worker that rewords the same facts brings nothing new. Replies that
 * name no fact at all ("Confirmed.", "Yes, that is correct.") compare on their content words instead.
 */
const comparedContent = (reference: string, reply: string): readonly [ReadonlySet<string>, ReadonlySet<string>] => {
    const referenceFacts = salientTokens(reference);
    const replyFacts = salientTokens(reply);
    return referenceFacts.size + replyFacts.size > 0 ? [referenceFacts, replyFacts] : [terms(reference), terms(reply)];
};

const sameReply = (reference: Delegation, delegation: Delegation, thresholds: DelegationPingPongThresholds): boolean =>
    jaccard(...comparedContent(replyOf(reference), replyOf(delegation))) >= thresholds.WORKER_TEXT_SIMILARITY.value;

/** A bounce: each delegation goes to the other worker, back to the worker two before, whose reply did not change. */
const bouncingDelegations = (thresholds: DelegationPingPongThresholds): AlternationRule<Delegation> => ({
    differs: (previous, delegation) => previous.workerName !== delegation.workerName,
    repeats: (twoBack, delegation) =>
        twoBack.workerName === delegation.workerName && sameReply(twoBack, delegation, thresholds),
});

type PingPong = {
    readonly supervisor: AgentRun;
    readonly kind: 'redelegation' | 'bounce';
    readonly delegations: readonly Delegation[];
    /** Delegations that brought nothing new: all but the first of a repeated task, all but the first round of a bounce. */
    readonly redundant: number;
    readonly total: number;
};

const pingPongIn = (
    supervisor: AgentRun,
    delegations: readonly Delegation[],
    thresholds: DelegationPingPongThresholds,
): PingPong | null => {
    const repeated = largestCluster(clusterBy(delegations, (reference, item) => sameTask(reference, item, thresholds)));
    if (repeated.length >= thresholds.MIN_REDELEGATIONS.value) {
        return {
            supervisor,
            kind: 'redelegation',
            delegations: repeated,
            redundant: repeated.length - 1,
            total: delegations.length,
        };
    }
    const bounce = longestAlternation(delegations, bouncingDelegations(thresholds));
    return bounce.length >= thresholds.MIN_BOUNCE_LENGTH.value
        ? {
              supervisor,
              kind: 'bounce',
              delegations: bounce,
              redundant: Math.max(0, bounce.length - 2),
              total: delegations.length,
          }
        : null;
};

const describePingPong = ({ supervisor, kind, delegations }: PingPong): string => {
    const workers = [...new Set(delegations.map((delegation) => delegation.workerName))].join(' and ');
    return kind === 'redelegation'
        ? `${supervisor.agentId} sent the same task to ${workers} ${delegations.length} times`
        : `${supervisor.agentId} bounced between ${workers} ${delegations.length} times with unchanged replies`;
};

/**
 * Fires when a supervisor sends the same task (same salient tokens, near-identical wording) to the same worker
 * `MIN_REDELEGATIONS` times, or bounces between two workers `MIN_BOUNCE_LENGTH` times while their replies stay the
 * same.
 */
export const detectDelegationPingPong: Detector<RunView, DelegationPingPongThresholds> = (
    view,
    thresholds,
): Verdict => {
    if (view.delegations.length === 0) {
        return { kind: 'not-applicable', reason: 'the run made no delegations' };
    }
    const bySupervisor = Map.groupBy(view.delegations, (delegation) => delegation.ownerAgentRunSpanId);
    const found = view.agentRuns.flatMap(
        (agentRun) => pingPongIn(agentRun, bySupervisor.get(agentRun.spanId) ?? [], thresholds) ?? [],
    );
    const worst = found.reduce<PingPong | null>(
        (current, candidate) => (current === null || candidate.redundant > current.redundant ? candidate : current),
        null,
    );
    if (worst === null) {
        return {
            kind: 'clear',
            evidence: {
                summary: `${view.delegations.length} delegations, no repeated task and no unproductive bounce`,
            },
        };
    }
    return {
        kind: 'fired',
        severity: unitIntervalSchema.parse(worst.redundant / worst.total),
        evidence: {
            spanIds: worst.delegations.map((delegation) => delegation.spanId),
            summary: describePingPong(worst),
        },
    };
};
