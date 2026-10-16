import { describe, expect, test } from 'vitest';

import { sampleQuestion } from '../../corpus/testing.ts';
import { goldAliases, goldAnswerFound, normalizeAnswer } from './gold-answer.ts';

const withGold = (answer: string) => sampleQuestion('q', ['A', 'B'], { answer });

describe('normalizeAnswer', () => {
    test('drops case, punctuation and articles, as HotpotQA does', () => {
        expect(normalizeAnswer('The  Bald Eagle!')).toBe('bald eagle');
    });
});

describe('goldAliases', () => {
    test('shortens a long capitalised name to any of its words and its last word', () => {
        expect(goldAliases('Louis-Hector Berlioz')).toEqual(
            new Set(['louis hector berlioz', 'louis berlioz', 'hector berlioz']),
        );
    });

    test('drops honorifics', () => {
        expect(goldAliases('Prof. Dr. Ulrich Hans Walter')).toContain('ulrich walter');
    });

    test('never lets a stopword lead a shortened name', () => {
        expect(goldAliases('My Gorgeous Life')).toEqual(new Set(['my gorgeous life', 'gorgeous life']));
    });

    test('never shortens a phrase that is not a name', () => {
        expect(goldAliases('Mauthausen–Gusen concentration camp')).toEqual(
            new Set(['mauthausen gusen concentration camp']),
        );
    });
});

// Every answer below is an excerpt of a recorded real-model answer.
describe('goldAnswerFound', () => {
    test('finds the gold answer inside a longer answer', () => {
        expect(goldAnswerFound(withGold('Oldham County'), 'It is oldham county, Kentucky [S1].')).toBe(true);
    });

    test('needs whole words: a prefix of a longer word does not count', () => {
        expect(goldAnswerFound(withGold('Oldham County'), 'Oldham Countyside')).toBe(false);
    });

    test('accepts a shortened name and a name without honorifics', () => {
        expect(
            goldAnswerFound(withGold('Louis-Hector Berlioz'), 'Hector Berlioz was the French Romantic composer.'),
        ).toBe(true);
        expect(goldAnswerFound(withGold('Prof. Dr. Ulrich Hans Walter'), 'Ulrich Walter was born first.')).toBe(true);
    });

    test('an answer that opens by abstaining finds nothing, though it names the gold option', () => {
        const answer =
            'I could not find an answer in the corpus. The search tool returned a "503: search backend unavailable" ' +
            'error for every query I tried, so I have no passages about the release dates of Hot Girls Wanted or China Blue.';
        expect(goldAnswerFound(withGold('China Blue'), answer)).toBe(false);
    });

    test('an answer that opens by abstaining finds nothing, though it offers a guess later', () => {
        const answer =
            "I couldn't answer this from the corpus. Based on general knowledge, not on anything verified here, the " +
            'answer is Hector Berlioz.';
        expect(goldAnswerFound(withGold('Louis-Hector Berlioz'), answer)).toBe(false);
    });

    test('a sentence that reports a failure does not count as naming the answer', () => {
        const answer =
            'Both searches returned a backend error for High Times and National Geographic. High Times was founded in 1974.';
        expect(goldAnswerFound(withGold('National Geographic'), answer)).toBe(false);
    });

    test('reads the answer that follows a reported failure and a retry', () => {
        const answer =
            "The search backend returned an error for both queries. I'll retry them.Ulrich Walter was born first.";
        expect(goldAnswerFound(withGold('Prof. Dr. Ulrich Hans Walter'), answer)).toBe(true);
    });

    test('judges the last step when an earlier step abstained before a retry', () => {
        const answer =
            "Both searches returned an error, so I could not retrieve any passages about either magazine. I'll retry " +
            'the searches.**Disney Magazine is no longer in publication.** It ran until April 2005.';
        expect(goldAnswerFound(withGold('no'), `${answer} No, both are not.`)).toBe(true);
    });

    // Recorded: a retry announcement glued to the answer that follows it, with no space between the steps.
    test('reads an answer glued to a retry announcement as its own sentence', () => {
        const answer =
            "Both searches returned a backend error, so I'll try again.Hector Berlioz was the French composer.";
        expect(goldAnswerFound(withGold('Louis-Hector Berlioz'), answer)).toBe(true);
    });

    describe('with a yes/no gold answer', () => {
        test('compares the first answer particle', () => {
            expect(goldAnswerFound(withGold('no'), 'No, Disney Magazine is no longer in publication.')).toBe(true);
            expect(
                goldAnswerFound(
                    withGold('no'),
                    '**Disney Magazine: No.** It ran until 2005. **The Ring: Probably yes, but not confirmed.**',
                ),
            ).toBe(true);
            expect(
                goldAnswerFound(
                    withGold('yes'),
                    "Both searches failed because the search backend returned a 503 error. I'll try again.Yes, for Todd Field.",
                ),
            ).toBe(true);
            expect(goldAnswerFound(withGold('yes'), 'No, they are not from the same country.')).toBe(false);
        });

        test('ignores quoted particles and "no" as a determiner', () => {
            expect(
                goldAnswerFound(withGold('yes'), 'Neither answer is "no" or "yes." No other source dates it [S1].'),
            ).toBeNull();
        });

        test('is false when the answer opens by abstaining', () => {
            const answer = 'I can\'t answer this yet. Neither answer is "no" or "yes."';
            expect(goldAnswerFound(withGold('yes'), answer)).toBe(false);
        });

        test('is null when the answer commits to neither', () => {
            expect(goldAnswerFound(withGold('yes'), 'Both are American directors [S1].')).toBeNull();
        });
    });
});
