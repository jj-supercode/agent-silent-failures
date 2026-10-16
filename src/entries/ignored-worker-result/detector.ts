import { mentionedTokens, salientTokens } from '../../text/salient-tokens.ts';
import { stringLeaves } from '../../text/string-leaves.ts';
import { isErrorResult } from '../../text/tool-failures.ts';
import { unitIntervalSchema, type AgentRun, type Delegation, type RunView } from '../../trace/model.ts';
import type { Detector, IgnoredWorkerResultThresholds, Verdict } from './model.ts';

const salientOfAll = (texts: readonly string[]): ReadonlySet<string> =>
    new Set(texts.flatMap((text) => [...salientTokens(text)]));

const replyText = (delegation: Delegation): string =>
    delegation.reply.kind === 'replied' ? delegation.reply.text : '';

const overlapShare = (facts: ReadonlySet<string>, answer: ReadonlySet<string>): number =>
    facts.intersection(answer).size / facts.size;

/** One supervisor run: its delegations, and the facts it held itself because it wrote them into a prompt. */
type Supervision = {
    readonly supervisor: AgentRun;
    readonly delegations: readonly Delegation[];
    readonly promptFacts: ReadonlySet<string>;
    readonly answer: ReadonlySet<string>;
};

/**
 * A worker whose every tool call failed found nothing, whatever its reply then says (an error code, the names it
 * could not look up, a guess). Its reply is not evidence the answer had to reflect.
 */
const workerFailed = ({ reply }: Delegation): boolean =>
    reply.kind === 'replied' &&
    reply.toolResults.length > 0 &&
    reply.toolResults.every((toolResult) => isErrorResult(toolResult.result));

/**
 * What a reply added: its salient tokens minus every token the supervisor itself wrote into a prompt. A failed
 * worker added nothing; an abstaining reply adds only the facts it still names, so a bare abstention adds none.
 */
const contributedFacts = (delegation: Delegation, supervision: Supervision): ReadonlySet<string> =>
    workerFailed(delegation) ? new Set() : salientTokens(replyText(delegation)).difference(supervision.promptFacts);

/**
 * What only this reply added: its contributed facts minus every fact in a different reply. A fact two workers both
 * reported cannot show which one the answer used; a re-delegation with the same reply does not subtract itself.
 */
const distinctiveFacts = (delegation: Delegation, supervision: Supervision): ReadonlySet<string> =>
    contributedFacts(delegation, supervision).difference(
        salientOfAll(supervision.delegations.map(replyText).filter((text) => text !== replyText(delegation))),
    );

/**
 * Every word the supervisor could have learned, in any position: prompts, replies and every value a tool returned
 * in the run. An answer fact is supported when its word appears anywhere there, not only where it is salient.
 */
const knownFacts = (supervision: Supervision, view: RunView): ReadonlySet<string> =>
    new Set(
        [
            ...supervision.delegations.flatMap((delegation) => [delegation.prompt ?? '', replyText(delegation)]),
            ...view.toolCalls.flatMap((call) =>
                call.outcome.kind === 'returned' ? stringLeaves(call.outcome.value) : [],
            ),
        ].flatMap((text) => [...mentionedTokens(text)]),
    );

type SupervisionJudgement =
    | { readonly kind: 'unjudgeable' }
    | { readonly kind: 'used' }
    | {
          readonly kind: 'ignored';
          readonly supervisor: AgentRun;
          readonly ignored: readonly Delegation[];
          readonly judged: number;
          readonly unsupported: readonly string[];
      };

/**
 * The workers whose facts never reached the answer. When no contributed fact of any reply reaches it, every worker
 * was ignored, however much the replies overlap. Otherwise only replies with distinctive facts can be told apart.
 */
const ignoredDelegations = (
    supervision: Supervision,
    thresholds: IgnoredWorkerResultThresholds,
): { readonly ignored: readonly Delegation[]; readonly judged: number } => {
    const contributing = supervision.delegations.filter(
        (delegation) => contributedFacts(delegation, supervision).size > 0,
    );
    const pooled = salientOfAll(contributing.map(replyText)).difference(supervision.promptFacts);
    if (overlapShare(pooled, supervision.answer) <= thresholds.MAX_IGNORED_OVERLAP.value) {
        return { ignored: contributing, judged: contributing.length };
    }
    const distinctive = supervision.delegations.flatMap((delegation) => {
        const facts = distinctiveFacts(delegation, supervision);
        return facts.size === 0 ? [] : [{ delegation, overlap: overlapShare(facts, supervision.answer) }];
    });
    return {
        ignored: distinctive
            .filter(({ overlap }) => overlap <= thresholds.MAX_IGNORED_OVERLAP.value)
            .map(({ delegation }) => delegation),
        judged: distinctive.length,
    };
};

const judgeSupervision = (
    supervision: Supervision,
    view: RunView,
    thresholds: IgnoredWorkerResultThresholds,
): SupervisionJudgement => {
    if (supervision.delegations.every((delegation) => contributedFacts(delegation, supervision).size === 0)) {
        return { kind: 'unjudgeable' };
    }
    const { ignored, judged } = ignoredDelegations(supervision, thresholds);
    const unsupported = [...supervision.answer.difference(knownFacts(supervision, view))];
    return ignored.length > 0 && unsupported.length > 0
        ? { kind: 'ignored', supervisor: supervision.supervisor, ignored, judged, unsupported }
        : { kind: 'used' };
};

const supervisions = (view: RunView): readonly Supervision[] => {
    const bySupervisor = Map.groupBy(view.delegations, (delegation) => delegation.ownerAgentRunSpanId);
    return view.agentRuns.flatMap((supervisor) => {
        const delegations = bySupervisor.get(supervisor.spanId) ?? [];
        return delegations.length === 0
            ? []
            : [
                  {
                      supervisor,
                      delegations,
                      promptFacts: salientOfAll(delegations.map((delegation) => delegation.prompt ?? '')),
                      answer: salientTokens(supervisor.outputText),
                  },
              ];
    });
};

type Ignored = Extract<SupervisionJudgement, { readonly kind: 'ignored' }>;

const describeIgnored = ({ supervisor, ignored, unsupported }: Ignored): string =>
    `${supervisor.agentId} answered with ${unsupported.slice(0, 5).join(', ')} (found in no prompt, worker reply or tool result) and used none of the facts from ${ignored.length} worker repl${ignored.length === 1 ? 'y' : 'ies'} (${[...new Set(ignored.map((delegation) => delegation.workerName))].join(', ')})`;

/**
 * Experimental. Fires when a worker's facts never reach the supervisor's answer and the answer asserts facts found
 * in no prompt, worker reply or tool result of the run. A worker's facts are the salient tokens of its reply that no
 * prompt held; when the answer uses facts from some replies, only facts no other reply reported count. The second
 * condition separates overriding a worker from summarising it away. A worker whose every tool call failed has no
 * facts: answering from other evidence (another worker, the supervisor's own tools) or abstaining ignores nothing.
 */
export const detectIgnoredWorkerResult: Detector<RunView, IgnoredWorkerResultThresholds> = (
    view,
    thresholds,
): Verdict => {
    const judgements = supervisions(view).map((supervision) => judgeSupervision(supervision, view, thresholds));
    if (judgements.every((judgement) => judgement.kind === 'unjudgeable')) {
        return {
            kind: 'not-applicable',
            reason: 'no worker reply contributed a salient fact (name, number or quote) beyond its prompts, or every worker that replied had only failed tool calls',
        };
    }
    const found = judgements.flatMap((judgement) => (judgement.kind === 'ignored' ? [judgement] : []));
    if (found.length === 0) {
        return {
            kind: 'clear',
            evidence: { summary: 'every answer used worker facts or asserted nothing beyond them' },
        };
    }
    const ignored = found.flatMap((judgement) => judgement.ignored);
    return {
        kind: 'fired',
        severity: unitIntervalSchema.parse(
            ignored.length / found.reduce((total, judgement) => total + judgement.judged, 0),
        ),
        evidence: {
            spanIds: ignored.map((delegation) => delegation.spanId),
            summary: found.map(describeIgnored).join('; '),
        },
    };
};
