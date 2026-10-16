import { Agent } from '@mastra/core/agent';
import { scoreTraceBatch } from '@mastra/core/evals/scoreTraces';
import { Mastra } from '@mastra/core/mastra';
import { InMemoryStore } from '@mastra/core/storage';
import { createTool } from '@mastra/core/tools';
import { createStep, createWorkflow } from '@mastra/core/workflows';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import { createScriptedModel, interactiveScenario, type AgentPolicy } from '../harness/index.ts';
import { spanTypes, toolNameSchema } from '../trace/index.ts';
import { swallowedToolErrorScorer } from './index.ts';

const confidentAnswer = 'Ed Wood was born in 1924.';

/** Calls the lookup tool once, then answers confidently whatever the tool returned. */
const swallowsErrors: AgentPolicy = ({ exchanges }) =>
    exchanges.length === 0
        ? { kind: 'call-tool', toolName: toolNameSchema.parse('lookup'), args: {} }
        : { kind: 'answer', text: confidentAnswer };

const lookup = createTool({
    id: 'lookup',
    description: 'Looks the subject up; the backend is down',
    inputSchema: z.object({}),
    execute: () => Promise.resolve({ error: 'upstream 503: lookup backend unavailable' }),
});

const answerAgent = () =>
    new Agent({
        id: 'answer-agent',
        name: 'answer agent',
        instructions: 'Look the subject up, then answer.',
        model: createScriptedModel(swallowsErrors, interactiveScenario),
        tools: { lookup },
    });

const answerOutput = z.object({ text: z.string() });

/** The three ways a workflow step can run an agent on Mastra 1.77; each stores one `workflow_run` trace. */
const agentSteps = {
    'getAgent().generate in a step': createStep({
        id: 'ask',
        inputSchema: z.object({ prompt: z.string() }),
        outputSchema: answerOutput,
        execute: async ({ mastra, inputData }) => ({
            text: (await mastra.getAgent('answerAgent').generate(inputData.prompt)).text,
        }),
    }),
    'getAgent().generate with tracingContext': createStep({
        id: 'ask',
        inputSchema: z.object({ prompt: z.string() }),
        outputSchema: answerOutput,
        execute: async ({ mastra, inputData, tracingContext }) => ({
            text: (
                await mastra
                    .getAgent('answerAgent')
                    .generate(inputData.prompt, tracingContext === undefined ? {} : { tracingContext })
            ).text,
        }),
    }),
    'createStep(agent)': createStep(answerAgent()),
};

const workflowTraceScore = async (step: (typeof agentSteps)[keyof typeof agentSteps]) => {
    const storage = new InMemoryStore();
    const workflow = createWorkflow({
        id: 'answer-question',
        inputSchema: z.object({ prompt: z.string() }),
        outputSchema: z.unknown(),
    })
        .then(step)
        .commit();
    const mastra = new Mastra({
        agents: { answerAgent: answerAgent() },
        workflows: { answerQuestion: workflow },
        scorers: { swallowedToolError: swallowedToolErrorScorer },
        storage,
        observability: new Observability({
            configs: { default: { serviceName: 'workflow-agent-test', exporters: [new MastraStorageExporter()] } },
        }),
    });
    const run = await mastra.getWorkflow('answerQuestion').createRun();
    await run.start({ inputData: { prompt: 'When was Ed Wood born?' } });
    await mastra.observability.getDefaultInstance()?.flush();
    const observability = await storage.getStore('observability');
    const roots = (await observability?.listTraces({}))?.spans ?? [];
    const scored = await scoreTraceBatch({
        storage,
        scorer: swallowedToolErrorScorer,
        targets: roots.map((root) => ({ traceId: root.traceId })),
    });
    await mastra.shutdown();
    return {
        rootTypes: roots.map((root) => root.spanType),
        scores: scored.results.map((result) =>
            'score' in result ? { score: result.score.score, reason: result.score.reason } : null,
        ),
    };
};

describe('run entries on agents called from workflow steps (real Mastra)', () => {
    test.each(Object.entries(agentSteps))('score the agent nested under the workflow_run root: %s', async (_, step) => {
        const { rootTypes, scores } = await workflowTraceScore(step);
        expect(rootTypes).toEqual([spanTypes.workflowRun]);
        expect(scores.map((scored) => scored?.score)).toEqual([1]);
        expect(scores[0]?.reason).toMatch(/^fired, severity 1\.00: answer-agent answered without acknowledging/);
    });
});
