import { answerSentences } from './answer-steps.ts';
import { stopwords } from './stopwords.ts';

const citationLabel = /\[[^\]]*\]/g;
const quotedSpan = /["“]([^"”]+)["”]/g;
const surroundingPunctuation = /^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu;
const capitalised = /^\p{Lu}/u;
const numeral = /^\p{N}[\p{N},.]*$/u;

/** A clause break, possibly followed by closing markup: "Ring:", "Magazine:**". */
const clauseEnd = /[:;,][^\p{L}\p{N}]*$/u;
const colonEnd = /:[^\p{L}\p{N}]*$/u;
const possessive = /['’]s$/u;

type Word = { readonly text: string; readonly endsClause: boolean; readonly endsWithColon: boolean };

const wordsWithBreaks = (text: string): readonly Word[] =>
    text
        .split(/\s+/)
        .map((raw) => ({
            text: raw.replaceAll(surroundingPunctuation, ''),
            endsClause: clauseEnd.test(raw),
            endsWithColon: colonEnd.test(raw),
        }))
        .filter((word) => word.text.length > 0);

const words = (text: string): readonly string[] => wordsWithBreaks(text).map((word) => word.text);

/**
 * One spelling per token: lower case, thousands separators dropped from numerals ("60,316" and "60316" agree), and
 * the possessive ending dropped, since it inflects a name without changing it ("The Ring's status" names The Ring).
 */
const normalizedToken = (word: string): string =>
    numeral.test(word) ? word.replaceAll(',', '') : word.replace(possessive, '').toLowerCase();

/**
 * Where English capitalises an ordinary word: the first word of a sentence, and the first word after a colon, which
 * opens a clause of its own ("The Ring: Probably yes").
 */
const opensClause = (all: readonly Word[], index: number): boolean =>
    index === 0 || all[index - 1]?.endsWithColon === true;

/** A capitalised clause opener is part of a name only when the name goes on: "Oldham County is", not "Confirmed: Scott". */
const opensName = (all: readonly Word[], index: number): boolean =>
    all[index]?.endsClause === false && capitalised.test(all[index + 1]?.text ?? '');

/**
 * Capitalised words and numerals, except a lone capitalised word that opens a sentence or a clause after a colon
 * (ordinary capitalisation). An opening that continues a name ("Oldham County is ...") is kept. Sentences are an
 * agent output's sentences (`answerSentences`): a step glued to the next ("retry once.Laurence Olivier") breaks too.
 */
const factWords = (sentence: string): readonly string[] => {
    const all = wordsWithBreaks(sentence);
    return all
        .filter(
            ({ text }, index) =>
                numeral.test(text) || (capitalised.test(text) && (!opensClause(all, index) || opensName(all, index))),
        )
        .map(({ text }) => text);
};

const quotedWords = (text: string): readonly string[] =>
    Array.from(text.matchAll(quotedSpan), ([, quoted]) => words(quoted ?? '')).flat();

/**
 * The tokens that carry a text's specific facts, every occurrence counted: every word inside quotes, plus numerals
 * and name words (see `factWords`) outside quotes, normalised (see `normalizedToken`) and without stopwords. Citation
 * labels such as `[S1]` are ignored. Counts matter where emphasis does: "look up A for: did A or B ..." names A twice.
 */
export const salientTokenList = (text: string): readonly string[] => {
    const content = text.replaceAll(citationLabel, ' ');
    const unquoted = content.replaceAll(quotedSpan, ' ');
    return [...quotedWords(content), ...answerSentences(unquoted).flatMap(factWords)]
        .map(normalizedToken)
        .filter((token) => !stopwords.has(token));
};

/** The distinct salient tokens of a text (see `salientTokenList`). */
export const salientTokens = (text: string): ReadonlySet<string> => new Set(salientTokenList(text));

/**
 * Every word of a text in salient-token spelling, whatever its case or position: the facts a text can vouch for. A
 * name that opens a sentence here ("Prof. Walter ...") still supports the same name written mid-sentence elsewhere.
 */
export const mentionedTokens = (text: string): ReadonlySet<string> =>
    new Set(words(text.replaceAll(citationLabel, ' ')).map(normalizedToken));
