// `createVectorQueryTool` catches any error from its vector store and returns `{ relevantContext: [], sources: [] }`
// as a successful result, so the agent sees "no matches" where the store failed (here: a missing index). The error
// survives only on the nested `rag_vector_operation` span. Separately, the tool maps every missing or NaN score to 0
// (`result.score || 0`), so a broken score reads as a real, lowest score.
import { Agent } from '@mastra/core/agent';
import { Mastra } from '@mastra/core/mastra';
import { SpanType } from '@mastra/core/observability';
import type { QueryResult } from '@mastra/core/vector';
import { fastembed } from '@mastra/fastembed';
import { LibSQLVector } from '@mastra/libsql';
import { createVectorQueryTool } from '@mastra/rag';
import { z } from 'zod';

import { captureConsole, firstLines } from '../shared/console-capture.ts';
import { flushTraces, observedStorage, requireStoredTrace, requireTraceId } from '../shared/observed-storage.ts';
import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import { scriptedModel, textTurn, toolCallTurn } from '../shared/scripted-model.ts';
import { spansOfType } from '../shared/trace-queries.ts';

const vectorQueryToolId = 'vectorQuery';
const missingIndexName = 'never_created';
const nanScoredRows: readonly QueryResult[] = [
    { id: 'chunk-1', score: Number.NaN, metadata: { text: 'Canaries warned miners.' } },
    { id: 'chunk-2', score: Number.NaN, metadata: { text: 'Miners carried canaries underground.' } },
];

const spanErrorSchema = z.object({ message: z.string() });

const toolResultSchema = z.object({
    relevantContext: z.array(z.unknown()),
    sources: z.array(z.object({ id: z.string(), score: z.number() })),
});

/** The same LibSQL store, except that `query` answers rows whose score is NaN, as a broken scorer would. */
const storeWithNanScores = (store: LibSQLVector): LibSQLVector =>
    new Proxy(store, {
        get: (target, property, receiver): unknown =>
            property === 'query' ? () => Promise.resolve(nanScoredRows) : Reflect.get(target, property, receiver),
    });

const researcherWith = (id: string, vectorStore: LibSQLVector): Agent =>
    new Agent({
        id,
        name: id,
        instructions: 'Answer from the corpus.',
        model: scriptedModel(`${id}-model`, [
            toolCallTurn('call-1', vectorQueryToolId, { queryText: 'What did canaries do?', topK: 3 }),
            textTurn('Canaries warned miners.'),
        ]),
        tools: {
            [vectorQueryToolId]: createVectorQueryTool({
                id: vectorQueryToolId,
                vectorStore,
                indexName: missingIndexName,
                model: fastembed,
            }),
        },
    });

const store = new LibSQLVector({ id: 'repro-vector-query', url: 'file::memory:' });
const { storage, observability } = observedStorage({ serviceName: 'repro-vector-query' });
const mastra = new Mastra({
    agents: {
        missingIndex: researcherWith('missing-index', store),
        nanScores: researcherWith('nan-scores', storeWithNanScores(store)),
    },
    storage,
    observability,
});

const observeRun = async (agentKey: 'missingIndex' | 'nanScores') => {
    using output = captureConsole();
    const result = await mastra.getAgent(agentKey).generate('What did canaries do?', { maxSteps: 3 });
    await flushTraces(mastra);
    const trace = await requireStoredTrace(mastra, requireTraceId(result));
    const [toolSpan] = spansOfType(trace, SpanType.TOOL_CALL);
    return {
        finalText: result.text,
        toolResult: toolResultSchema.parse(result.toolResults[0]?.payload.result),
        toolCallSpan: { error: toolSpan?.error ?? null, success: toolSpan?.attributes?.success ?? null },
        vectorOperationSpanErrors: spansOfType(trace, SpanType.RAG_VECTOR_OPERATION).map(
            (span) => spanErrorSchema.safeParse(span.error).data?.message ?? null,
        ),
        consoleLines: firstLines(output),
    };
};

const missingIndex = await observeRun('missingIndex');
const nanScores = await observeRun('nanScores');
await store.close();

const storeErrorBecameEmptyResult =
    missingIndex.toolResult.sources.length === 0 &&
    missingIndex.toolCallSpan.error === null &&
    missingIndex.vectorOperationSpanErrors.some((message) => message !== null);
const nanScoresBecameZero =
    nanScores.toolResult.sources.length === nanScoredRows.length &&
    nanScores.toolResult.sources.every((source) => source.score === 0);

await reportOutcome(
    'vector-query-tool-swallows-store-errors',
    outcomeWhen(
        storeErrorBecameEmptyResult && nanScoresBecameZero,
        `querying a missing index returned ${missingIndex.toolResult.sources.length} sources with no error on the ` +
            `tool_call span (error only on the nested rag_vector_operation span); NaN scores came back as ` +
            `${nanScores.toolResult.sources.map((source) => source.score).join(', ')}`,
        { missingIndex, nanScores },
    ),
);
