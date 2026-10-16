import type { DelegationCompleteContext, DelegationCompleteResult } from '@mastra/core/agent';

/** Which delegation a worker reply answers, so a fault can act on some replies only. */
export type DelegationReplyContext = {
    /** The worker's agent id, e.g. `researcher-agent`. */
    readonly workerId: string;
    /** The supervisor's delegation count so far, 1-based. */
    readonly iteration: number;
};

/** The delegation-reply seam: faults rewrite the text a supervisor reads as a worker's reply. */
export type DelegationReplyWrapper = (reply: string, delegation: DelegationReplyContext) => string;

/**
 * Mastra's `onDelegationComplete` hook applying the wrappers in list order. A changed text replaces the tool result
 * the supervisor reads (`resultText`); an unchanged one leaves the delegation as Mastra returned it.
 */
export const delegationReplyHook =
    (wrappers: readonly DelegationReplyWrapper[]) =>
    ({ primitiveId, iteration, result }: DelegationCompleteContext): DelegationCompleteResult | undefined => {
        const delegation = { workerId: primitiveId, iteration };
        const reply = wrappers.reduce((text, wrap) => wrap(text, delegation), result.text);
        return reply === result.text ? undefined : { resultText: reply };
    };
