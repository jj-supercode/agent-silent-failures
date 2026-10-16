import type { LanguageModelV4CallOptions, LanguageModelV4StreamPart } from '@ai-sdk/provider';
import { Agent } from '@mastra/core/agent';
import { MockLanguageModelV4, simulateReadableStream } from 'ai/test';
import { describe, expect, test } from 'vitest';

import { questionIdSchema } from '../../corpus/index.ts';
import { descendingScore, sampleHits } from '../../trace/testing.ts';
import { toRequestContext } from '../scenario.ts';
import { searchCorpusHitsSchema, type SearchCorpusOutput } from './model.ts';
import { createSearchCorpusTool, searchCorpusToolId } from './search-corpus-tool.ts';

const topK = 3;
const rowsPerSearch = 2;
/** Spaced chunks, as a real provider streams them: Mastra then runs each tool before the step's next call arrives. */
const chunkDelayInMs = 15;
const scenario = { questionId: questionIdSchema.parse('streamed-labels'), seed: 0 };
const usage = {
    inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
    outputTokens: { total: 0, text: 0, reasoning: 0 },
};

/** A tool call streamed the way providers do: input deltas first, then the complete call. */
const streamedToolCall = (id: string, toolName: string, input: object): readonly LanguageModelV4StreamPart[] => {
    const serialized = JSON.stringify(input);
    const half = Math.floor(serialized.length / 2);
    return [
        { type: 'tool-input-start', id, toolName },
        { type: 'tool-input-delta', id, delta: serialized.slice(0, half) },
        { type: 'tool-input-delta', id, delta: serialized.slice(half) },
        { type: 'tool-input-end', id },
        { type: 'tool-call', toolCallId: id, toolName, input: serialized },
    ];
};

const textBlock = (id: string, text: string): readonly LanguageModelV4StreamPart[] => [
    { type: 'text-start', id },
    { type: 'text-delta', id, delta: text },
    { type: 'text-end', id },
];

const assistantTurns = (options: LanguageModelV4CallOptions): number =>
    options.prompt.filter((message) => message.role === 'assistant').length;

/** Streams `firstTurn` (leading text, then parallel tool calls), then answers once the tools have returned. */
const streamingModel = (firstTurn: readonly LanguageModelV4StreamPart[]) =>
    new MockLanguageModelV4({
        doStream: (options) => {
            const answering = assistantTurns(options) > 0;
            const chunks: LanguageModelV4StreamPart[] = [
                { type: 'stream-start', warnings: [] },
                ...(answering ? textBlock('answer', 'Done.') : [...textBlock('lead', 'Searching.'), ...firstTurn]),
                {
                    type: 'finish',
                    usage,
                    finishReason: answering
                        ? { unified: 'stop', raw: 'end_turn' }
                        : { unified: 'tool-calls', raw: 'tool_use' },
                },
            ];
            return Promise.resolve({
                stream: simulateReadableStream({ chunks, initialDelayInMs: chunkDelayInMs, chunkDelayInMs }),
            });
        },
    });

const searches = (...queries: readonly string[]): readonly LanguageModelV4StreamPart[] =>
    queries.flatMap((query) => streamedToolCall(`search-${query}`, searchCorpusToolId, { query }));

/** The real `searchCorpus`, over a fixed retriever, recording every labelled output it returns. */
const recordingSearchTool = () => {
    const outputs: SearchCorpusOutput[] = [];
    const tool = createSearchCorpusTool({
        retriever: () => Promise.resolve(sampleHits(rowsPerSearch, descendingScore)),
        topK,
        outputWrappers: [
            (output) => {
                outputs.push(output);
                return output;
            },
        ],
    });
    const labelsPerSearch = (): readonly (readonly string[])[] =>
        outputs.map((output) => searchCorpusHitsSchema.parse(output).hits.map((hit) => hit.citation));
    return { tool, labelsPerSearch };
};

const consume = async (agent: Agent, withRunEdge: boolean): Promise<void> => {
    const output = await agent.stream(
        'Find both facts.',
        withRunEdge ? { requestContext: toRequestContext(scenario) } : {},
    );
    await output.consumeStream();
};

const searchingAgent = (id: string, search: ReturnType<typeof recordingSearchTool>, ...queries: readonly string[]) =>
    new Agent({
        id,
        name: id,
        description: `Searches for ${queries.join(' and ')}.`,
        instructions: 'Search, then answer.',
        model: streamingModel(searches(...queries)),
        tools: { [searchCorpusToolId]: search.tool },
    });

describe('citation labels on a streamed run', () => {
    test.each([
        { edge: 'the run edge', withRunEdge: true },
        { edge: 'no run edge', withRunEdge: false },
    ])('two parallel searches streamed with chunk delays get distinct labels, with $edge', async ({ withRunEdge }) => {
        const search = recordingSearchTool();
        await consume(searchingAgent('streamed-searcher', search, 'first', 'second'), withRunEdge);
        expect(search.labelsPerSearch()).toEqual([
            ['S1', 'S2'],
            ['S4', 'S5'],
        ]);
    });

    test('in a supervisor run, no label repeats across the searches of its workers', async () => {
        const search = recordingSearchTool();
        const supervisor = new Agent({
            id: 'supervisor',
            name: 'supervisor',
            instructions: 'Delegate, then answer.',
            model: streamingModel([
                ...streamedToolCall('delegate-a', 'agent-alpha', { prompt: 'Find alpha.' }),
                ...streamedToolCall('delegate-b', 'agent-beta', { prompt: 'Find beta.' }),
            ]),
            agents: {
                alpha: searchingAgent('alpha', search, 'alpha one', 'alpha two'),
                beta: searchingAgent('beta', search, 'beta one'),
            },
        });
        await consume(supervisor, true);
        const labels = search.labelsPerSearch().flat();
        expect(search.labelsPerSearch()).toHaveLength(3);
        expect(new Set(labels).size).toBe(labels.length);
    });
});
