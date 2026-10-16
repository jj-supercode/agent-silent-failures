import { describe, expect, test } from 'vitest';

import { descendingScore, sampleHits } from '../../trace/testing.ts';
import { citationLabel } from '../citations.ts';
import { searchCorpusToolId } from '../search/search-corpus-tool.ts';
import { abstentionAnswer, answerFromHitsPolicy, composeAnswer } from './answer-from-hits.ts';
import type { Conversation, ToolExchange } from './model.ts';
import { createDraw } from './seeded-draw.ts';

const question = 'Which river runs through the city?';
const draw = createDraw(1, ['q']);
const labelled = (count: number) =>
    sampleHits(count, descendingScore).map((hit, index) => ({ ...hit, citation: citationLabel(0, count, index + 1) }));

const conversation = (exchanges: readonly ToolExchange[]): Conversation => ({
    question,
    exchanges,
    assistantTurns: exchanges.length,
    offeredTools: [searchCorpusToolId],
});
const searched = (output: unknown, failed = false): ToolExchange => ({
    toolName: searchCorpusToolId,
    args: { query: question },
    output,
    failed,
});

describe('answerFromHitsPolicy', () => {
    test('searches first, with a phrasing of the question', () => {
        const turn = answerFromHitsPolicy(conversation([]), draw);
        expect(turn).toMatchObject({ kind: 'call-tool', toolName: searchCorpusToolId });
        expect(turn.kind === 'call-tool' && String(turn.args['query'])).toContain('Which river');
    });

    test('answers from the returned rows once a search came back', () => {
        const hits = labelled(3);
        expect(answerFromHitsPolicy(conversation([searched({ hits })]), draw)).toEqual({
            kind: 'answer',
            text: composeAnswer(hits),
        });
    });

    test('abstains with the contract sentence when the search returned no rows', () => {
        expect(answerFromHitsPolicy(conversation([searched({ hits: [] })]), draw)).toEqual({
            kind: 'answer',
            text: abstentionAnswer,
        });
    });

    test('retries a failed search once with the same query, then abstains', () => {
        const failure = searched({ error: 'upstream 503' });
        expect(answerFromHitsPolicy(conversation([failure]), draw)).toEqual({
            kind: 'call-tool',
            toolName: searchCorpusToolId,
            args: { query: question },
        });
        expect(answerFromHitsPolicy(conversation([failure, failure]), draw)).toEqual({
            kind: 'answer',
            text: abstentionAnswer,
        });
    });

    test('treats an SDK-marked failure as failed even if the payload looks like rows', () => {
        expect(answerFromHitsPolicy(conversation([searched({ hits: labelled(1) }, true)]), draw).kind).toBe(
            'call-tool',
        );
    });
});

describe('composeAnswer', () => {
    test('cites the top row and the best row from a second source', () => {
        const hits = labelled(3).map((hit, rank, all) =>
            rank === 1 ? { ...hit, sourceId: all[0]?.sourceId ?? hit.sourceId } : hit,
        );
        expect(composeAnswer(hits)).toBe('Passage 0 of the sample corpus. [S1] Passage 2 of the sample corpus. [S3]');
    });
});
