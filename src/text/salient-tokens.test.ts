import { describe, expect, test } from 'vitest';

import { mentionedTokens, salientTokenList, salientTokens } from './salient-tokens.ts';

describe('salientTokens', () => {
    test('keeps numbers without thousands separators', () => {
        expect(salientTokens('the population was 60,316 in 2010')).toEqual(new Set(['60316', '2010']));
    });

    test('keeps name words inside a sentence and drops a lone capitalised opener', () => {
        expect(salientTokens('Its county seat is La Grange.')).toEqual(new Set(['la', 'grange']));
    });

    test('keeps a name that opens a sentence', () => {
        expect(salientTokens('Oldham County is in Kentucky.')).toEqual(new Set(['oldham', 'county', 'kentucky']));
    });

    test('drops an opener that a colon or comma separates from the name after it', () => {
        expect(salientTokens('Confirmed: Scott Derrickson is American.')).toEqual(
            new Set(['scott', 'derrickson', 'american']),
        );
        expect(salientTokens('Indeed, Ed Wood directed it.')).toEqual(new Set(['ed', 'wood']));
    });

    test('drops a lone capitalised word that opens a clause after a colon, as after a sentence start', () => {
        expect(salientTokens('**The Ring: Probably yes, but not confirmed.**')).toEqual(new Set(['ring']));
        expect(salientTokens('**Disney Magazine:** No. It ended in 2005.')).toEqual(
            new Set(['disney', 'magazine', '2005']),
        );
    });

    test('keeps a name that opens a clause after a colon', () => {
        expect(salientTokens('The answer: Hugh Dowding led Fighter Command.')).toEqual(
            new Set(['hugh', 'dowding', 'fighter', 'command']),
        );
    });

    // Recorded: Mastra joins step texts with no space, so a name can open the next step right after a full stop.
    test('keeps a name that opens a step glued to the one before', () => {
        expect(salientTokens("Both searches failed. I'll retry once.Laurence Olivier played Hugh Dowding.")).toEqual(
            new Set(['laurence', 'olivier', 'hugh', 'dowding']),
        );
    });

    test('spells a possessive name like the name', () => {
        expect(salientTokens("Disney Magazine ended. The Ring's status can't be confirmed.")).toEqual(
            new Set(['disney', 'magazine', 'ring']),
        );
        expect(mentionedTokens('Laurence Olivier played Dowding’s part')).toContain('dowding');
    });

    test('ignores citation labels and stopwords inside names', () => {
        expect(salientTokens('He joined The Beatles [S1].')).toEqual(new Set(['beatles']));
    });

    test('keeps quoted words', () => {
        expect(salientTokens('the film "night of the ghouls" premiered')).toEqual(new Set(['night', 'ghouls']));
    });

    test('a text without facts has no salient tokens', () => {
        expect(salientTokens('Both were born there.').size).toBe(0);
    });
});

describe('salientTokenList', () => {
    test('counts a quoted name once, spelled like the same name outside quotes', () => {
        expect(salientTokenList('He starred in "Secret Service" and Secret Service.')).toEqual([
            'secret',
            'service',
            'secret',
            'service',
        ]);
    });

    test('spells a numeral the same inside and outside quotes', () => {
        expect(salientTokenList('"60,316 people" or 60,316 residents')).toEqual(['60316', 'people', '60316']);
    });

    test('counts every occurrence of a name', () => {
        expect(salientTokenList('Look up Ed Wood for this question: did Ed Wood meet Scott Derrickson?')).toEqual([
            'ed',
            'wood',
            'ed',
            'wood',
            'scott',
            'derrickson',
        ]);
    });
});

describe('mentionedTokens', () => {
    test('keeps every word, so a sentence-opening name still counts as mentioned', () => {
        expect(mentionedTokens('Prof. [S1] Walter founded it in 1,854.')).toEqual(
            new Set(['prof', 'walter', 'founded', 'it', 'in', '1854']),
        );
    });
});
