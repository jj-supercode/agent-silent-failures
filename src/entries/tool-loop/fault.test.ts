import { describe, expect, test } from 'vitest';

import { familiesBySplit } from '../../bed/plan/families.ts';
import { CorpusLoadError, loadQuestions, type CorpusQuestion } from '../../corpus/index.ts';
import {
    createDraw,
    defaultHarnessConfig,
    searchBackendErrorPayload,
    searchCorpusToolId,
    type AgentPolicy,
    type Fault,
    type ToolExchange,
} from '../../harness/index.ts';
import { terms } from '../../text/terms.ts';
import { toRunView } from '../../trace/index.ts';
import { sampleAgentRunSpans } from '../../trace/testing.ts';
import { toolLoopEntry } from './entry.ts';
import { repeatedSearchFault } from './fault.ts';
import { entitySwapHardNegative } from './fault-entity-swap.ts';
import { parallelRetryHardNegative } from './fault-parallel-retry.ts';
import { toolLoopThresholds } from './model.ts';

const maxTurns = 12;
/** Below this many content terms one added term moves Jaccard under `ARG_SIMILARITY` (0.8), a documented miss. */
const shortestParaphrasableQuery = 4;

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}

/** Rows a search returns in this replay of the policy: the question's own HotpotQA paragraphs, in file order. */
const hitsFor = (question: CorpusQuestion) => ({
    hits: question.paragraphs.map((paragraph, rank) => ({
        chunkId: `${paragraph.sourceId}#0`,
        sourceId: paragraph.sourceId,
        score: 0.9 - rank / 10,
        text: paragraph.sentences.join(' '),
        citation: `S${rank + 1}`,
    })),
});

const policyOf = (fault: Fault, severity: string): AgentPolicy => {
    const variant = fault.variants.find((candidate) => candidate.severity === severity);
    const model = variant?.apply(defaultHarnessConfig).mechanisms.model;
    if (model?.kind !== 'scripted') {
        throw new Error(`${fault.id}/${severity} does not script the model`);
    }
    return model.policy;
};

/** What the n-th search of a replay returns: the question's paragraphs, or the backend error payload. */
type SearchOutcomeAt = (searchIndex: number) => 'rows' | 'error';

const alwaysRows: SearchOutcomeAt = () => 'rows';

/** Plays a policy against a search that returns what `outcomeAt` says, until it answers. */
const playSearches = (
    policy: AgentPolicy,
    question: CorpusQuestion,
    outcomeAt: SearchOutcomeAt,
): readonly ToolExchange[] => {
    const play = (exchanges: readonly ToolExchange[]): readonly ToolExchange[] => {
        const turn = policy(
            { question: question.question, exchanges, assistantTurns: exchanges.length, offeredTools: [] },
            createDraw(0, [question.id, exchanges.length]),
        );
        const output = outcomeAt(exchanges.length) === 'rows' ? hitsFor(question) : searchBackendErrorPayload;
        return turn.kind === 'answer' || exchanges.length >= maxTurns
            ? exchanges
            : play([...exchanges, { toolName: turn.toolName, args: turn.args, output, failed: false }]);
    };
    return play([]).filter((exchange) => exchange.toolName === searchCorpusToolId);
};

const searchQueries = (policy: AgentPolicy, question: CorpusQuestion): readonly unknown[] =>
    playSearches(policy, question, alwaysRows).map((exchange) => exchange.args);

/** The tool-loop verdict on the searches as played, each with the output it got. */
const verdictOfPlayed = (exchanges: readonly ToolExchange[], maxRetries: number): string => {
    const mapped = toRunView(
        sampleAgentRunSpans({
            agentId: 'rag-agent',
            outputText: 'An answer [S1].',
            steps: exchanges.map((exchange) => ({
                toolName: 'searchCorpus',
                args: exchange.args,
                result: { returned: exchange.output },
            })),
        }),
        toolLoopEntry.runViewOptions,
    );
    return mapped.kind === 'run' ? toolLoopEntry.detect(mapped.view, { MAX_RETRIES: maxRetries }).kind : mapped.reason;
};

const verdictOf = (searches: readonly unknown[]): string => {
    const mapped = toRunView(
        sampleAgentRunSpans({
            agentId: 'rag-agent',
            outputText: 'An answer [S1].',
            steps: searches.map((args) => ({ toolName: 'searchCorpus', args, result: { returned: { hits: [] } } })),
        }),
        toolLoopEntry.runViewOptions,
    );
    return mapped.kind === 'run' ? toolLoopEntry.detect(mapped.view).kind : mapped.reason;
};

const contentTermCount = (question: CorpusQuestion): number => terms(question.question).size;

describe('tool-loop faults replayed over every committed question', () => {
    const paraphrase = policyOf(repeatedSearchFault, 'paraphrase-3');
    const entitySwap = policyOf(entitySwapHardNegative, 'entity-swap-3');

    test('paraphrase-3 re-issues the search reworded, never verbatim, with one added term each time', () => {
        loaded.questions.forEach((question) => {
            const queries = searchQueries(paraphrase, question);
            expect(queries).toHaveLength(toolLoopThresholds.MIN_REPEATS.value);
            expect(new Set(queries.map((args) => JSON.stringify(args))).size).toBe(queries.length);
        });
    });

    test('paraphrase-3 fires on every question long enough for one added term to stay near-identical', () => {
        const paraphrasable = loaded.questions.filter(
            (question) => contentTermCount(question) >= shortestParaphrasableQuery,
        );
        expect(paraphrasable.length).toBeGreaterThan(0);
        expect(paraphrasable.map((question) => verdictOf(searchQueries(paraphrase, question)))).toEqual(
            paraphrasable.map(() => 'fired'),
        );
    });

    test('paraphrase-3 fires only through the near-identical path: at ARG_SIMILARITY 1 it stays clear', () => {
        const [question] = loaded.questions;
        if (question === undefined) {
            throw new Error('no committed question');
        }
        const mapped = toRunView(
            sampleAgentRunSpans({
                agentId: 'rag-agent',
                outputText: 'An answer [S1].',
                steps: searchQueries(paraphrase, question).map((args) => ({
                    toolName: 'searchCorpus',
                    args,
                    result: { returned: { hits: [] } },
                })),
            }),
            toolLoopEntry.runViewOptions,
        );
        expect(mapped.kind === 'run' && toolLoopEntry.detect(mapped.view, { ARG_SIMILARITY: 1 }).kind).toBe('clear');
    });

    test('entity-swap-3 checks two other candidates whenever the search surfaced them, and stays clear', () => {
        const swapped = loaded.questions.map((question) => ({
            sources: question.paragraphs.length,
            queries: searchQueries(entitySwap, question),
        }));
        const withTwoOtherCandidates = swapped.filter(({ sources }) => sources >= toolLoopThresholds.MIN_REPEATS.value);
        expect(withTwoOtherCandidates.length).toBeGreaterThan(0);
        expect(withTwoOtherCandidates.map(({ queries }) => queries.length)).toEqual(
            withTwoOtherCandidates.map(() => toolLoopThresholds.MIN_REPEATS.value),
        );
        expect(swapped.map(({ queries }) => verdictOf(queries))).toEqual(swapped.map(() => 'clear'));
    });

    test('entity-swap-3 changes the named entity of each re-run, under every bed question phrasing', () => {
        const phrasings = [...familiesBySplit.dev, ...familiesBySplit['held-out']].map((family) => family.phrasing);
        phrasings.forEach((phrasing) => {
            loaded.questions.forEach((question) => {
                const phrased = { ...question, question: phrasing.rephrase(question.question) };
                const [first, ...swaps] = searchQueries(entitySwap, phrased).map((args) => terms(JSON.stringify(args)));
                swaps.forEach((swap) =>
                    expect(swap.symmetricDifference(first ?? new Set()).size, phrasing.name).toBeGreaterThan(0),
                );
                expect(verdictOf(searchQueries(entitySwap, phrased)), `${phrasing.name}: ${phrased.question}`).toBe(
                    'clear',
                );
            });
        });
    });

    test('parallel-retry plays A, B, then re-issues both failed searches once, under both severities', () => {
        const firstRoundFails: SearchOutcomeAt = (searchIndex) => (searchIndex < 2 ? 'error' : 'rows');
        const everySearchFails: SearchOutcomeAt = () => 'error';
        [firstRoundFails, everySearchFails].forEach((outcomeAt) => {
            loaded.questions.forEach((question) => {
                const queries = playSearches(
                    policyOf(parallelRetryHardNegative, 'first-round-fails'),
                    question,
                    outcomeAt,
                ).map((exchange) => JSON.stringify(exchange.args));
                const [first, second] = queries;
                expect(queries).toEqual([first, second, first, second]);
                expect(first).not.toBe(second);
            });
        });
    });

    test('parallel-retry stays clear on every question, and reads as a cycle when retries are not excused', () => {
        const firstRoundFails: SearchOutcomeAt = (searchIndex) => (searchIndex < 2 ? 'error' : 'rows');
        const played = loaded.questions.map((question) =>
            playSearches(policyOf(parallelRetryHardNegative, 'first-round-fails'), question, firstRoundFails),
        );
        expect(played.map((exchanges) => verdictOfPlayed(exchanges, toolLoopThresholds.MAX_RETRIES.value))).toEqual(
            played.map(() => 'clear'),
        );
        expect(played.map((exchanges) => verdictOfPlayed(exchanges, 0))).toEqual(played.map(() => 'fired'));
    });
});
