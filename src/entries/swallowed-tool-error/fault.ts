import {
    composeAnswer,
    defineFault,
    searchBackendErrorPayload,
    searchCorpusHitsSchema,
    searchTurn,
    withModel,
    withSearchOutputWrapper,
    type AgentPolicy,
    type HarnessConfig,
    type SearchCallContext,
} from '../../harness/index.ts';
import { withoutQuestionMark } from '../../text/questions.ts';

/** A confident answer that uses no retrieved row: what a model writes from its prior after ignoring the error. */
const unsupportedAnswer = (question: string): string =>
    `According to the corpus, the answer to "${withoutQuestionMark(question)}" is well documented.`;

/**
 * Searches `searches` times (a retry of the same query after an error, otherwise a refinement), never reads an error
 * as a reason to stop, then answers from whatever rows arrived, or without any.
 */
const proceedingPolicy =
    (searches: number): AgentPolicy =>
    ({ question, exchanges }) => {
        const rows = exchanges.flatMap(
            (exchange) => searchCorpusHitsSchema.safeParse(exchange.output).data?.hits ?? [],
        );
        if (exchanges.length >= searches) {
            return { kind: 'answer', text: rows.length > 0 ? composeAnswer(rows) : unsupportedAnswer(question) };
        }
        return exchanges.length === 0 || rows.length === 0 ? searchTurn(question) : searchTurn(`${question} details`);
    };

const severities = ['answer-without-retry', 'retry-then-answer', 'refinement-failed'] as const;
type Severity = (typeof severities)[number];

/** Which calls of a run fail, by how many completed searches came before them. */
const failsOn = (severity: Severity, call: SearchCallContext): boolean => {
    switch (severity) {
        case 'answer-without-retry':
            return call.priorCalls === 0;
        case 'retry-then-answer':
            return true;
        case 'refinement-failed':
            return call.priorCalls === 1;
        default:
            return severity satisfies never;
    }
};

const plannedSearches = (severity: Severity): number => (severity === 'answer-without-retry' ? 1 : 2);

const apply = (config: HarnessConfig, severity: Severity): HarnessConfig =>
    withModel(
        withSearchOutputWrapper(config, (output, call) =>
            failsOn(severity, call) ? searchBackendErrorPayload : output,
        ),
        { kind: 'scripted', policy: proceedingPolicy(plannedSearches(severity)) },
    );

/**
 * `searchCorpus` returns an error payload instead of rows, and the model answers anyway: without retrying, after a
 * failed retry, or from the first search when only its refinement failed. Runs on `createHarness`.
 */
export const swallowedSearchErrorFault = defineFault({
    id: 'swallowed-search-error',
    description: 'searchCorpus returns an error payload and the agent answers as if the search had worked.',
    severities,
    apply,
});
