import { Agent, type ToolsInput } from '@mastra/core/agent';

import { agentLabelled, workerLabelled, type AgentLabel } from '../agent-label.ts';
import type { AgentModelSource } from '../config.ts';
import { abstentionAnswer } from '../policy/answer-from-hits.ts';
import { agentModel } from '../rag-agent.ts';
import { searchCorpusToolId } from '../search/search-corpus-tool.ts';
import { delegationReplyHook, type DelegationReplyWrapper } from './delegation-reply.ts';
import { checkerId, checkerKey, researcherId, researcherKey, supervisorId } from './model.ts';
import { readSourceToolId, type createReadSourceTool } from './read-source-tool.ts';

export type MultiAgentDependencies = {
    readonly model: AgentModelSource;
    readonly searchCorpus: ToolsInput[string];
    readonly readSource: ReturnType<typeof createReadSourceTool>;
    readonly maxSteps: number;
    readonly delegationReplyWrappers: readonly DelegationReplyWrapper[];
    readonly label?: AgentLabel;
};

const createResearcher = ({ model, searchCorpus, maxSteps, label }: MultiAgentDependencies) =>
    new Agent({
        id: researcherId,
        ...workerLabelled(
            {
                name: 'Researcher',
                description: 'Searches the corpus for one subject and reports the facts it finds, with citations.',
            },
            label,
        ),
        instructions: [
            `Search the corpus with the ${searchCorpusToolId} tool and report what the passages say, citing labels such as [S1].`,
            `If the passages do not cover the request, reply exactly: ${abstentionAnswer}`,
        ].join('\n'),
        model: agentModel(model),
        tools: { [searchCorpusToolId]: searchCorpus },
        defaultOptions: { maxSteps },
    });

const createChecker = ({ model, readSource, maxSteps, label }: MultiAgentDependencies) =>
    new Agent({
        id: checkerId,
        ...workerLabelled(
            { name: 'Checker', description: 'Reads a named source page by page and reports what it says.' },
            label,
        ),
        instructions: `Read the requested source with the ${readSourceToolId} tool, page by page, and report its key facts.`,
        model: agentModel(model),
        tools: { [readSourceToolId]: readSource },
        defaultOptions: { maxSteps },
    });

export const supervisorInstructions = [
    'You answer multi-part questions by delegating. The last line of the message names the subjects.',
    `Ask the ${researcherKey} about each subject once; ask the ${checkerKey} to read a source when a fact needs checking.`,
    'Answer only from what your workers report.',
].join('\n');

/**
 * The supervisor idiom from Mastra's subagent docs (`agents: {}` on the parent, never the deprecated `.network()`).
 * Workers receive only the delegated prompt: the message filter drops the parent's conversation, so a worker's
 * question is the task it was given.
 */
export const createSupervisor = (dependencies: MultiAgentDependencies) =>
    new Agent({
        id: supervisorId,
        ...agentLabelled(
            {
                name: 'Supervisor',
                description: 'Answers multi-part questions by delegating research to a researcher and a checker.',
            },
            dependencies.label,
        ),
        instructions: supervisorInstructions,
        model: agentModel(dependencies.model),
        agents: { [researcherKey]: createResearcher(dependencies), [checkerKey]: createChecker(dependencies) },
        defaultOptions: {
            maxSteps: dependencies.maxSteps,
            delegation: {
                messageFilter: () => [],
                ...(dependencies.delegationReplyWrappers.length === 0
                    ? {}
                    : { onDelegationComplete: delegationReplyHook(dependencies.delegationReplyWrappers) }),
            },
        },
    });
