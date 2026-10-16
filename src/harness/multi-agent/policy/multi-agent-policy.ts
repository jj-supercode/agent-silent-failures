import { answerFromHitsPolicy } from '../../policy/answer-from-hits.ts';
import type { AgentPolicy, Conversation } from '../../policy/model.ts';
import { researcherToolName } from '../model.ts';
import { readSourceToolId } from '../read-source-tool.ts';
import { checkerPolicy } from './checker-policy.ts';
import { cleanSupervisorPolicy } from './clean-supervisor-policy.ts';

export type RolePolicies = {
    readonly supervisor: AgentPolicy;
    readonly researcher: AgentPolicy;
    readonly checker: AgentPolicy;
};

export const cleanRolePolicies: RolePolicies = {
    supervisor: cleanSupervisorPolicy,
    researcher: answerFromHitsPolicy,
    checker: checkerPolicy,
};

export type AgentRole = keyof RolePolicies;

/**
 * Which agent of the multi-agent harness a model call serves, read from the tools it is offered: only the supervisor
 * is offered the researcher, only the checker is offered `readSource`.
 */
export const agentRoleOf = (conversation: Conversation): AgentRole =>
    conversation.offeredTools.includes(researcherToolName)
        ? 'supervisor'
        : conversation.offeredTools.includes(readSourceToolId)
          ? 'checker'
          : 'researcher';

/**
 * One policy for every agent of the multi-agent harness, routed by `agentRoleOf`. One policy keeps the harness on
 * the single `model` mechanism, so a fault replaces one role and leaves the others clean.
 */
export const createMultiAgentPolicy = (overrides: Partial<RolePolicies> = {}): AgentPolicy => {
    const roles: RolePolicies = { ...cleanRolePolicies, ...overrides };
    return (conversation, draw) => roles[agentRoleOf(conversation)](conversation, draw);
};
