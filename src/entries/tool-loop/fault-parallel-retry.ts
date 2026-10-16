import {
    composeAnswer,
    defineFault,
    searchBackendErrorPayload,
    searchCorpusArgsSchema,
    searchCorpusHitsSchema,
    searchTurn,
    withModel,
    withSearchOutputWrapper,
    type AgentPolicy,
    type SearchHit,
    type SearchOutputWrapper,
    type ToolExchange,
} from '../../harness/index.ts';
import { questionHalves } from './fault.ts';

const roundSize = 2;

/** The rows a search returned; `null` when it failed (thrown, or an error payload). */
const rowsOf = (exchange: ToolExchange): readonly SearchHit[] | null =>
    exchange.failed ? null : (searchCorpusHitsSchema.safeParse(exchange.output).data?.hits ?? null);

const queryOf = (exchange: ToolExchange): readonly string[] => {
    const query = searchCorpusArgsSchema.safeParse(exchange.args).data?.query;
    return query === undefined ? [] : [query];
};

const failedQueries = (round: readonly ToolExchange[]): readonly string[] =>
    round.filter((exchange) => rowsOf(exchange) === null).flatMap(queryOf);

/**
 * Searches both halves of the question as one round, re-issues every search of that round that failed, then
 * answers from the rows it got, or abstains. This is the order in which a model's two parallel calls and their
 * retries reach the trace: A, B, A, B, the second pair re-issuing a failed first pair.
 */
const parallelRetryPolicy: AgentPolicy = ({ question, exchanges }) => {
    const firstRound = exchanges.slice(0, roundSize);
    const retries = firstRound.length === roundSize ? failedQueries(firstRound) : [];
    const next = [...questionHalves(question), ...retries][exchanges.length];
    return next === undefined
        ? { kind: 'answer', text: composeAnswer(exchanges.flatMap((exchange) => rowsOf(exchange) ?? [])) }
        : searchTurn(next);
};

const severities = ['first-round-fails', 'every-search-fails'] as const;

const searchFailures = (severity: (typeof severities)[number]): SearchOutputWrapper => {
    switch (severity) {
        case 'first-round-fails':
            return (output, call) => (call.priorCalls < roundSize ? searchBackendErrorPayload : output);
        case 'every-search-fails':
            return () => searchBackendErrorPayload;
        default:
            return severity satisfies never;
    }
};

/**
 * A hard negative for tool-loop, the pattern a real model showed under search errors: two parallel searches fail,
 * the agent re-issues both once, then answers or abstains. Retries of failed calls must stay clear.
 */
export const parallelRetryHardNegative = defineFault({
    id: 'parallel-retry',
    description:
        'The agent runs two searches in parallel; both fail with an error payload and it re-issues both once, then ' +
        'answers from the rows or abstains: retries, which must stay clear.',
    severities,
    apply: (config, severity) =>
        withModel(withSearchOutputWrapper(config, searchFailures(severity)), {
            kind: 'scripted',
            policy: parallelRetryPolicy,
        }),
});
