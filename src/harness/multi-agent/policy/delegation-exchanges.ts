import { z } from 'zod';

import type { ToolName } from '../../../trace/index.ts';
import type { Conversation, ToolExchange } from '../../policy/model.ts';
import { checkerToolName, researcherToolName } from '../model.ts';

const delegationArgsSchema = z.object({ prompt: z.string() });
const delegationReplySchema = z.union([z.object({ text: z.string() }), z.string()]);

/** A delegation the supervisor already made, with the worker's reply text as the supervisor saw it. */
export type DelegationExchange = {
    readonly toolName: ToolName;
    readonly prompt: string;
    readonly replyText: string;
};

const toDelegationExchange = (exchange: ToolExchange): readonly DelegationExchange[] => {
    const args = delegationArgsSchema.safeParse(exchange.args);
    const reply = delegationReplySchema.safeParse(exchange.output);
    if (!args.success || (exchange.toolName !== researcherToolName && exchange.toolName !== checkerToolName)) {
        return [];
    }
    const replyText =
        !reply.success || exchange.failed ? '' : typeof reply.data === 'string' ? reply.data : reply.data.text;
    return [{ toolName: exchange.toolName, prompt: args.data.prompt, replyText }];
};

export const delegationExchanges = (conversation: Conversation): readonly DelegationExchange[] =>
    conversation.exchanges.flatMap(toDelegationExchange);
