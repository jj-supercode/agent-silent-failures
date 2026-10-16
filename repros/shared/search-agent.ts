import { Agent } from '@mastra/core/agent';
import type { MastraScorers } from '@mastra/core/evals';
import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { scriptedModel, textTurn, toolCallTurn, type ScriptedTurn } from './scripted-model.ts';

export const searchToolId = 'searchCorpus';
export const lookupToolId = 'lookupSource';
export const repeatedQuery = { query: 'canary' } as const;

const searchCorpus = createTool({
    id: searchToolId,
    description: 'Search the corpus',
    inputSchema: z.object({ query: z.string() }),
    outputSchema: z.object({ hits: z.array(z.object({ id: z.string(), score: z.number() })) }),
    execute: ({ query }) =>
        Promise.resolve({
            hits: [
                { id: `doc-a:${query}`, score: 0.5 },
                { id: `doc-b:${query}`, score: 0.5 },
            ],
        }),
});

const lookupSource = createTool({
    id: lookupToolId,
    description: 'Fetch one source by id',
    inputSchema: z.object({ sourceId: z.string() }),
    outputSchema: z.object({ text: z.string() }),
    execute: ({ sourceId }) => Promise.resolve({ text: `text of ${sourceId}` }),
});

/** The model calls `searchCorpus` with identical arguments in two consecutive turns, then answers. */
export const repeatedSearchScript: readonly ScriptedTurn[] = [
    toolCallTurn('call-1', searchToolId, repeatedQuery),
    toolCallTurn('call-2', searchToolId, repeatedQuery),
    textTurn('Canaries warned miners [doc-a].'),
];

export const searchAgent = (
    id: string,
    script: readonly ScriptedTurn[] = repeatedSearchScript,
    scorers: MastraScorers = {},
): Agent =>
    new Agent({
        id,
        name: id,
        instructions: 'Answer from the corpus.',
        model: scriptedModel(`${id}-model`, script),
        tools: { searchCorpus, lookupSource },
        scorers,
    });
