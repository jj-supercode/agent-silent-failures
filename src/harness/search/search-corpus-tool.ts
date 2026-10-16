import { createTool } from '@mastra/core/tools';
import { z } from 'zod';

import { toolNameSchema, type RetrievalHit } from '../../trace/index.ts';
import { citationLabel } from '../citations.ts';
import { scenarioFromRequestContext } from '../scenario.ts';
import {
    searchCorpusOutputSchema,
    type Retriever,
    type SearchCorpusOutput,
    type SearchHit,
    type SearchOutputWrapper,
} from './model.ts';
import { countCompletedToolCalls } from './prior-calls.ts';
import { ensureSearchPositions } from './search-positions.ts';

export const searchCorpusToolId = toolNameSchema.parse('searchCorpus');

const labelHits = (hits: readonly RetrievalHit[], searchPosition: number, topK: number): readonly SearchHit[] =>
    hits.map((hit, index) => ({ ...hit, citation: citationLabel(searchPosition, topK, index + 1) }));

export type SearchCorpusToolDependencies = {
    readonly retriever: Retriever;
    readonly topK: number;
    readonly outputWrappers: readonly SearchOutputWrapper[];
};

/** The search tool's input; scripted policies read their earlier queries back with it. */
export const searchCorpusArgsSchema = z.object({
    query: z.string().min(1).describe('What to look for, in plain words'),
});

export const createSearchCorpusTool = ({ retriever, topK, outputWrappers }: SearchCorpusToolDependencies) =>
    createTool({
        id: searchCorpusToolId,
        description:
            'Searches the document corpus. Returns the most similar passages with a relevance score and a citation label such as S1.',
        inputSchema: searchCorpusArgsSchema,
        outputSchema: searchCorpusOutputSchema,
        execute: async ({ query }, context) => {
            const searchPosition = ensureSearchPositions(context.requestContext)();
            const call = {
                scenario: scenarioFromRequestContext(context.requestContext),
                priorCalls: countCompletedToolCalls(context.agent?.getMessages?.() ?? [], searchCorpusToolId),
            };
            const hits = await retriever({ query, topK, metadataFilter: null, minScore: null, call });
            return outputWrappers.reduce<SearchCorpusOutput>((output, wrap) => wrap(output, { ...call, query }), {
                hits: labelHits(hits, searchPosition, topK),
            });
        },
    });
