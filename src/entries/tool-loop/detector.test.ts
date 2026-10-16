import { describe, expect, test } from 'vitest';

import { toRunView } from '../../trace/index.ts';
import type { RunView } from '../../trace/model.ts';
import {
    sampleAgentRunSpans,
    sampleRetrievalTools,
    type AgentRunSample,
    type ToolCallSample,
} from '../../trace/testing.ts';
import { detectToolLoop } from './detector.ts';
import { toolLoopThresholds } from './model.ts';

const stepBudget = 10;
const okRows = { returned: { hits: [] } };

const search = (query: string): ToolCallSample => ({ toolName: 'searchCorpus', args: { query }, result: okRows });
/** The error payload the recorded outage runs returned. */
const failedSearch = (query: string): ToolCallSample => ({
    toolName: 'searchCorpus',
    args: { query },
    result: { returned: { error: 'upstream 503: search backend unavailable' } },
});
const thrownSearch = (query: string): ToolCallSample => ({
    toolName: 'searchCorpus',
    args: { query },
    result: { threw: 'fetch failed' },
});
const readPage = (page: number): ToolCallSample => ({
    toolName: 'readSource',
    args: { sourceId: 'Ed Wood', page },
    result: { returned: { text: 'page', hasMore: true } },
});

const viewOf = (run: AgentRunSample): RunView => {
    const built = toRunView(sampleAgentRunSpans(run), { retrievalTools: sampleRetrievalTools() });
    if (built.kind !== 'run') {
        throw new Error(built.reason);
    }
    return built.view;
};

const agentWith = (steps: AgentRunSample['steps']): RunView =>
    viewOf({ agentId: 'rag-agent', outputText: 'An answer [S1].', maxSteps: stepBudget, steps });

const detect = (view: RunView) => detectToolLoop(view, toolLoopThresholds);

describe('detectToolLoop fires', () => {
    test('on three near-identical searches that differ only in case, punctuation and plurals', () => {
        const verdict = detect(
            agentWith([
                search('Ed Wood film director nationality'),
                search('ed wood films director nationality?'),
                search('ED WOOD  film director nationality'),
            ]),
        );
        expect(verdict.kind).toBe('fired');
    });

    test('on non-adjacent repeats with other calls in between', () => {
        const query = 'Scott Derrickson film director nationality';
        const verdict = detect(agentWith([search(query), readPage(1), search(query), readPage(2), search(query)]));
        expect(verdict.kind).toBe('fired');
    });

    test('on a reworded loop: the question reordered, one refinement term added each time', () => {
        const question = 'What is the name of the Australian specialist electronic music magazine';
        const verdict = detect(
            agentWith([
                search(question),
                search('specialist electronic music magazine What is the name of the Australian details'),
                search(`exact ${question}`),
            ]),
        );
        expect(verdict.kind).toBe('fired');
    });

    test('on two full A-B-A-B cycles of different queries', () => {
        const first = 'Scott Derrickson birth year';
        const second = 'Ed Wood birth year';
        const verdict = detect(agentWith([search(first), search(second), search(first), search(second)]));
        expect(verdict.kind === 'fired' ? verdict.evidence.summary : '').toContain('cycles');
    });

    test('on near-identical queries whose other arguments are listed in a different key order', () => {
        const call = (args: Readonly<Record<string, unknown>>): ToolCallSample => ({
            toolName: 'searchCorpus',
            args,
            result: okRows,
        });
        const verdict = detect(
            agentWith([
                call({ query: 'Ed Wood film director nationality', topK: 5, minScore: 0.2 }),
                call({ minScore: 0.2, topK: 5, query: 'ed wood films director nationality' }),
                call({ topK: 5, query: 'Ed Wood film director nationality?', minScore: 0.2 }),
            ]),
        );
        expect(verdict.kind).toBe('fired');
    });

    test('on a failing call retried once more than the retry budget', () => {
        const attempts = toolLoopThresholds.MAX_RETRIES.value + 2;
        const verdict = detect(agentWith(Array.from({ length: attempts }, () => failedSearch('Hector Berlioz'))));
        expect(verdict).toMatchObject({ kind: 'fired', evidence: { spanIds: { length: attempts } } });
    });

    test('on repeats after a retry succeeded: the agent already had a usable result', () => {
        const query = 'Todd Field film director';
        const verdict = detect(agentWith([failedSearch(query), search(query), search(query), search(query)]));
        expect(verdict.kind).toBe('fired');
    });

    test('on an A-B-A-B cycle of calls that all succeeded', () => {
        const verdict = detect(
            agentWith([
                search('Wilco Melissant'),
                search('Todd Field'),
                search('Wilco Melissant'),
                search('Todd Field'),
            ]),
        );
        expect(verdict.kind).toBe('fired');
    });

    test('with severity growing with the number of repeats against the step budget', () => {
        const repeats = (count: number) => agentWith(Array.from({ length: count }, () => search('Ed Wood birth year')));
        const severities = [3, 5, stepBudget].map((count) => {
            const verdict = detect(repeats(count));
            return verdict.kind === 'fired' ? verdict.severity : -1;
        });
        expect(severities).toEqual([1 / 8, 3 / 8, 1]);
    });
});

describe('detectToolLoop stays clear', () => {
    test('naming the single agent run it judged', () => {
        expect(detect(agentWith([search('Ed Wood birth year')]))).toEqual({
            kind: 'clear',
            evidence: {
                summary: `no tool call repeated ${toolLoopThresholds.MIN_REPEATS.value} times or cycled in the agent run`,
            },
        });
    });

    test('on one legitimate retry of the same search', () => {
        expect(detect(agentWith([search('Ed Wood birth year'), search('Ed Wood birth year')])).kind).toBe('clear');
    });

    // Recorded from a real model under a transient search error: two parallel searches fail and are re-issued.
    test('on two parallel searches that failed and were re-issued once, then succeeded', () => {
        const verdict = detect(
            agentWith([
                failedSearch('Jean-François Clervoy birth date'),
                failedSearch('Ulrich Walter astronaut born'),
                search('Jean-François Clervoy birth date'),
                search('Ulrich Walter astronaut born'),
            ]),
        );
        expect(verdict).toEqual({
            kind: 'clear',
            evidence: {
                summary: `no tool call repeated ${toolLoopThresholds.MIN_REPEATS.value} times or cycled in the agent run (2 retries of failed calls not counted)`,
            },
        });
    });

    // Recorded from a real model under a search outage: both searches fail twice, then the agent abstains.
    test('on two parallel searches that failed on both attempts', () => {
        const verdict = detect(
            agentWith([
                failedSearch('Disney Magazine publication status'),
                failedSearch('The Ring wrestling magazine still in publication'),
                failedSearch('Disney Magazine publication status'),
                failedSearch('The Ring magazine still in publication'),
            ]),
        );
        expect(verdict.kind).toBe('clear');
    });

    test('on a failing call retried exactly up to the retry budget', () => {
        const attempts = toolLoopThresholds.MAX_RETRIES.value + 1;
        expect(detect(agentWith(Array.from({ length: attempts }, () => failedSearch('Hector Berlioz')))).kind).toBe(
            'clear',
        );
    });

    test('on a thrown call retried up to the retry budget', () => {
        const query = 'Hector Berlioz nationality';
        const attempts = toolLoopThresholds.MAX_RETRIES.value + 1;
        expect(detect(agentWith(Array.from({ length: attempts }, () => thrownSearch(query)))).kind).toBe('clear');
    });

    test('on a paginated read where only the page number changes', () => {
        expect(detect(agentWith([readPage(1), readPage(2), readPage(3), readPage(4)])).kind).toBe('clear');
    });

    test('on search then refine with a substituted term', () => {
        const verdict = detect(
            agentWith([search('Ed Wood birth year'), search('Ed Wood death year'), search('Ed Wood burial place')]),
        );
        expect(verdict.kind).toBe('clear');
    });

    // Both questions are long enough that one swapped term keeps Jaccard above ARG_SIMILARITY: the name rule decides.
    test('on the same long question asked about three different entities', () => {
        const question = (country: string) =>
            `What is the name of the ${country} specialist electronic music magazine that features avant-rock, experimental sound art and hip hop`;
        expect(
            detect(agentWith([search(question('Australian')), search(question('Canadian')), search(question('Irish'))]))
                .kind,
        ).toBe('clear');
    });

    test('on the same question asked about three different years', () => {
        const question = (year: number) =>
            `Which film won the best picture award at the Academy Awards ceremony held in Los Angeles in ${year}`;
        expect(detect(agentWith([search(question(1994)), search(question(1995)), search(question(1996))])).kind).toBe(
            'clear',
        );
    });

    test('on short queries that differ in one term', () => {
        expect(detect(agentWith([search('Ed Wood'), search('Ed Woods film'), search('Wood film')])).kind).toBe('clear');
    });

    test('on a supervisor delegating the same prompt: delegations belong to delegation-ping-pong', () => {
        const worker = { agentId: 'researcher', outputText: 'Ed Wood was American.', steps: [search('Ed Wood')] };
        const delegation = { workerName: 'researcher', prompt: 'Research Ed Wood.', worker };
        const verdict = detect(
            viewOf({ agentId: 'supervisor', outputText: 'American.', steps: [delegation, delegation, delegation] }),
        );
        expect(verdict.kind).toBe('clear');
    });
});

describe('detectToolLoop is not applicable', () => {
    test('to a run without tool calls', () => {
        expect(detect(agentWith([])).kind).toBe('not-applicable');
    });
});
