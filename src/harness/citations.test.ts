import { describe, expect, test } from 'vitest';

import { toRunView } from '../trace/index.ts';
import { descendingScore, sampleAgentRunSpans, sampleHits, sampleRetrievalTools } from '../trace/testing.ts';
import { citationLabel, citedLabels, resolveCitations } from './citations.ts';

const topK = 3;
const hits = sampleHits(topK, descendingScore);
const viewWithAnswer = (outputText: string, searches: readonly (readonly unknown[])[]) => {
    const result = toRunView(
        sampleAgentRunSpans({
            agentId: 'rag-agent',
            outputText,
            steps: searches.map((rows, index) => ({
                toolName: 'searchCorpus',
                args: { query: `q${index}` },
                result: { returned: { hits: rows } },
            })),
        }),
        { retrievalTools: sampleRetrievalTools() },
    );
    if (result.kind !== 'run') {
        throw new Error(result.reason);
    }
    return result.view;
};

describe('citedLabels', () => {
    test('lists each bracketed label once, in order of first use', () => {
        expect(citedLabels('A [S2]. B [S1]. C [S2].')).toEqual(['S2', 'S1']);
    });
});

describe('citationLabel', () => {
    test('continues numbering across the searches of a run, one block of top K labels per search', () => {
        expect([
            citationLabel(0, 5, 1),
            citationLabel(0, 5, 5),
            citationLabel(1, 5, 1),
            citationLabel(2, 5, 3),
        ]).toEqual(['S1', 'S5', 'S6', 'S13']);
    });
});

describe('resolveCitations', () => {
    test('resolves each label to the row of the search that labelled it', () => {
        const otherHits = sampleHits(topK, descendingScore).map((hit) => ({ ...hit, text: `Other ${hit.text}` }));
        const view = viewWithAnswer('Fact [S2]. Other fact [S4].', [hits, otherHits]);
        expect(resolveCitations(view, topK)).toEqual([
            { label: 'S2', hit: hits[1] },
            { label: 'S4', hit: otherHits[0] },
        ]);
    });

    test('an empty search still takes its block of labels', () => {
        const view = viewWithAnswer('Fact [S5].', [[], hits]);
        expect(resolveCitations(view, topK)).toEqual([{ label: 'S5', hit: hits[1] }]);
    });

    test("a supervisor's answer resolves the labels its workers relayed, numbered across the workers", () => {
        const otherHits = sampleHits(topK, descendingScore).map((hit) => ({ ...hit, text: `Other ${hit.text}` }));
        const worker = (rows: readonly unknown[], query: string) => ({
            agentId: 'researcher-agent',
            outputText: 'Found it.',
            steps: [{ toolName: 'searchCorpus', args: { query }, result: { returned: { hits: rows } } }],
        });
        const spans = sampleAgentRunSpans({
            agentId: 'supervisor-agent',
            outputText: 'First [S1]; second [S4].',
            steps: [
                { workerName: 'researcher', prompt: 'first subject', worker: worker(hits, 'q0') },
                { workerName: 'researcher', prompt: 'second subject', worker: worker(otherHits, 'q1') },
            ],
        });
        const result = toRunView(spans, { retrievalTools: sampleRetrievalTools() });
        if (result.kind !== 'run') {
            throw new Error(result.reason);
        }
        expect(resolveCitations(result.view, topK)).toEqual([
            { label: 'S1', hit: hits[0] },
            { label: 'S4', hit: otherHits[0] },
        ]);
    });

    test('a label with no matching row resolves to null', () => {
        expect(resolveCitations(viewWithAnswer('Fact [S9].', [hits]), topK)).toEqual([{ label: 'S9', hit: null }]);
    });
});
