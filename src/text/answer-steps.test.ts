import { describe, expect, test } from 'vitest';

import { answerSentences, answerSteps, lastStepText } from './answer-steps.ts';

describe('answerSteps', () => {
    // Recorded from a real model: the retry announcement and the answer, joined by Mastra with no separator.
    test('splits where a step ends and the next one starts without a space', () => {
        expect(
            answerSteps(
                "The search backend returned an error for both queries. I'll retry them.Ulrich Walter was born first.",
            ),
        ).toEqual([
            "The search backend returned an error for both queries. I'll retry them.",
            'Ulrich Walter was born first.',
        ]);
    });

    test('splits before a step that opens in bold', () => {
        expect(lastStepText("I'll retry the searches.**Disney Magazine is no longer in publication.**")).toBe(
            '**Disney Magazine is no longer in publication.**',
        );
    });

    test('keeps abbreviations and ordinary sentence breaks inside one step', () => {
        const text = 'He moved to the U.S. in 1990. He worked at U.S.A. Today [S1].';
        expect(answerSteps(text)).toEqual([text]);
    });

    // Recorded: the most common join, a retry announcement followed by an answer that opens with "I".
    test('splits before a step that opens with the pronoun I', () => {
        expect(
            lastStepText("Both searches returned a backend error, so I'll try again.I could not find an answer."),
        ).toBe('I could not find an answer.');
    });

    test('splits after a sentence closed by a bracket or a quote', () => {
        expect(answerSteps('The search failed (503).Ulrich Walter was born first.')).toEqual([
            'The search failed (503).',
            'Ulrich Walter was born first.',
        ]);
    });
});

describe('answerSentences', () => {
    test('treats a step join as a sentence boundary', () => {
        expect(answerSentences("Both searches failed. I'll retry once.Laurence Olivier played Hugh Dowding.")).toEqual([
            'Both searches failed.',
            "I'll retry once.",
            'Laurence Olivier played Hugh Dowding.',
        ]);
    });
});
