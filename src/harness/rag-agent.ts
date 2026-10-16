import { Agent } from '@mastra/core/agent';
import type { MastraModelConfig } from '@mastra/core/llm';
import type { MastraMemory } from '@mastra/core/memory';
import type { RequestContext } from '@mastra/core/request-context';

import { agentIdSchema, agentKeySchema } from '../trace/index.ts';
import { agentLabelled, type AgentLabel } from './agent-label.ts';
import type { AgentModelSource } from './config.ts';
import { createScriptedModel } from './policy/scripted-model.ts';
import { scenarioFromRequestContext } from './scenario.ts';
import { searchCorpusToolId, type createSearchCorpusTool } from './search/search-corpus-tool.ts';

export const ragAgentKey = agentKeySchema.parse('ragAgent');
export const ragAgentId = agentIdSchema.parse('rag-agent');

/** The model an agent of this harness runs: a scripted policy (offline) or a provided model. */
export const agentModel = (
    source: AgentModelSource,
): MastraModelConfig | (({ requestContext }: { requestContext: RequestContext }) => MastraModelConfig) => {
    switch (source.kind) {
        case 'scripted':
            return ({ requestContext }) =>
                createScriptedModel(source.policy, scenarioFromRequestContext(requestContext));
        case 'provided':
            return source.model;
        default:
            return source satisfies never;
    }
};

export type RagAgentDependencies = {
    readonly model: AgentModelSource;
    readonly instructions: string;
    readonly searchCorpus: ReturnType<typeof createSearchCorpusTool>;
    readonly maxSteps: number;
    readonly memory?: MastraMemory;
    readonly label?: AgentLabel;
};

export const createRagAgent = ({ model, instructions, searchCorpus, maxSteps, memory, label }: RagAgentDependencies) =>
    new Agent({
        id: ragAgentId,
        ...agentLabelled(
            { name: 'RAG agent', description: 'Answers questions from the HotpotQA corpus with cited passages' },
            label,
        ),
        instructions,
        model: agentModel(model),
        tools: { [searchCorpusToolId]: searchCorpus },
        defaultOptions: { maxSteps },
        ...(memory === undefined ? {} : { memory }),
    });
