import { withoutQuestionMark } from '../../text/questions.ts';
import { leadSentence } from './lead-sentence.ts';
import { searchCorpusHitsSchema, type SearchHit } from '../search/model.ts';
import { searchCorpusArgsSchema, searchCorpusToolId } from '../search/search-corpus-tool.ts';
import { pickWithDraw } from './seeded-draw.ts';
import type { AgentPolicy, PolicyTurn } from './model.ts';

/** The abstention contract: the agent instructions require this exact sentence when the corpus has no answer. */
export const abstentionAnswer = 'I could not find an answer in the corpus.';

/** One search plus one retry after a failed call, then the policy abstains. */
const maxSearchAttempts = 2;
/** The answer cites the top row and the best row from a second source, when there is one. */
const citedSourceCount = 2;

const queryPhrasings: readonly [(question: string) => string, ...((question: string) => string)[]] = [
    (question) => question,
    withoutQuestionMark,
];

const citedRows = (hits: readonly SearchHit[]): readonly SearchHit[] =>
    hits.reduce<readonly SearchHit[]>(
        (cited, hit) =>
            cited.length < citedSourceCount && cited.every((row) => row.sourceId !== hit.sourceId)
                ? [...cited, hit]
                : cited,
        [],
    );

export const composeAnswer = (hits: readonly SearchHit[]): string =>
    hits.length === 0
        ? abstentionAnswer
        : citedRows(hits)
              .map((row) => `${leadSentence(row.text)} [${row.citation}]`)
              .join(' ');

/** The model turn that searches the corpus for `query`. */
export const searchTurn = (query: string): PolicyTurn => ({
    kind: 'call-tool',
    toolName: searchCorpusToolId,
    args: { query },
});

const retryOrAbstain = (attempts: number, lastArgs: unknown): PolicyTurn => {
    const lastQuery = searchCorpusArgsSchema.safeParse(lastArgs).data?.query;
    return attempts < maxSearchAttempts && lastQuery !== undefined
        ? searchTurn(lastQuery)
        : { kind: 'answer', text: abstentionAnswer };
};

/**
 * The clean single-agent policy: search once with a seeded phrasing of the question, answer from the returned
 * rows with citations, abstain on zero rows, and retry once when the search fails.
 */
export const answerFromHitsPolicy: AgentPolicy = (conversation, draw) => {
    const searches = conversation.exchanges.filter((exchange) => exchange.toolName === searchCorpusToolId);
    const lastSearch = searches.at(-1);
    if (lastSearch === undefined) {
        return searchTurn(pickWithDraw(queryPhrasings, draw('query-phrasing'))(conversation.question));
    }
    const rows = searchCorpusHitsSchema.safeParse(lastSearch.output);
    return rows.success && !lastSearch.failed
        ? { kind: 'answer', text: composeAnswer(rows.data.hits) }
        : retryOrAbstain(searches.length, lastSearch.args);
};
