import { setTimeout } from 'node:timers/promises';

import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { InMemoryStore } from '@mastra/core/storage';
import { createTool } from '@mastra/core/tools';
import { MastraStorageExporter, Observability } from '@mastra/observability';
import { MockLanguageModelV4 } from 'ai/test';
import { describe, expect, test } from 'vitest';
import { z } from 'zod';

import { loadTraceSpans } from './load-trace.ts';
import { traceIdSchema } from './model.ts';

const toolDelayMilliseconds = 400;
const midRunMilliseconds = 150;
const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
};

/** Calls the slow tool once, then answers. */
const model = new MockLanguageModelV4({
    modelId: 'one-call',
    doGenerate: ({ prompt }) =>
        Promise.resolve(
            prompt.some((message) => message.role === 'tool')
                ? {
                      content: [{ type: 'text', text: 'done' }],
                      usage,
                      finishReason: { unified: 'stop', raw: 'end_turn' },
                      warnings: [],
                  }
                : {
                      content: [{ type: 'tool-call', toolCallId: 'call-0', toolName: 'slow', input: '{}' }],
                      usage,
                      finishReason: { unified: 'tool-calls', raw: 'tool_use' },
                      warnings: [],
                  },
        ),
});

const slow = createTool({
    id: 'slow',
    description: 'Waits, then fails',
    inputSchema: z.object({}),
    execute: async () => {
        await setTimeout(toolDelayMilliseconds);
        throw new Error('upstream 503');
    },
});

describe('loadTraceSpans on real Mastra storage', () => {
    test('a trace read while the run is still going is in-progress, and loads once the run has finished', async () => {
        const storage = new InMemoryStore();
        const mastra = new Mastra({
            agents: {
                probe: new Agent({ id: 'probe', name: 'probe', instructions: 'Use the tool.', model, tools: { slow } }),
            },
            storage,
            observability: new Observability({
                configs: { default: { serviceName: 'load-trace-test', exporters: [new MastraStorageExporter()] } },
            }),
        });
        const running = mastra.getAgent('probe').generate('go', { maxSteps: 3 });
        await setTimeout(midRunMilliseconds);
        await mastra.observability.getDefaultInstance()?.flush();
        const observability = await storage.getStore('observability');
        const listed = await observability?.listTraces({});
        const midRunTraceId = traceIdSchema.parse(listed?.spans[0]?.traceId);

        const midRun = await loadTraceSpans(mastra, midRunTraceId);
        expect(midRun).toMatchObject({ kind: 'failed', failure: { kind: 'in-progress', traceId: midRunTraceId } });

        await running;
        await mastra.observability.getDefaultInstance()?.flush();
        const finished = await loadTraceSpans(mastra, midRunTraceId);
        expect(finished.kind).toBe('loaded');
        await mastra.shutdown();
    });
});
