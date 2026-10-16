import type { CorpusQuestion } from '../../corpus/index.ts';
import { acknowledgesFailure, isAbstention } from '../../text/abstention.ts';
import { answerSentences, lastStepText } from '../../text/answer-steps.ts';
import { firstSentence } from '../../text/sentences.ts';
import { stopwords } from '../../text/stopwords.ts';

/** HotpotQA's official `normalize_answer`: lower case, no punctuation, no articles, single spaces. */
export const normalizeAnswer = (text: string): string =>
    text
        .toLowerCase()
        .replaceAll(/[\p{P}\p{S}]/gu, ' ')
        .replaceAll(/\b(a|an|the)\b/g, ' ')
        .split(/\s+/)
        .filter((word) => word.length > 0)
        .join(' ');

/** Titles a gold answer may carry that an answer naming the same person drops: "Prof. Dr. Ulrich Hans Walter". */
const honorifics: ReadonlySet<string> = new Set(['prof', 'dr', 'mr', 'mrs', 'ms', 'sir']);

/** A gold name of at least this many words may be shortened to a given name and its last word. */
const shortenableNameWords = 3;

const isCapitalised = (word: string): boolean => /^\p{Lu}/u.test(word);

/** Any word of a capitalised name of three or more words, never a stopword, followed by the name's last word. */
const shortenedNames = (gold: string, named: readonly string[]): readonly string[] => {
    const last = named.at(-1);
    const isLongName = gold.split(/\s+/).every(isCapitalised) && named.length >= shortenableNameWords;
    return isLongName && last !== undefined
        ? named
              .slice(0, -1)
              .filter((word) => !stopwords.has(word))
              .map((word) => `${word} ${last}`)
        : [];
};

/**
 * The spellings that name the gold answer: the normalised gold; without honorifics; and, for a capitalised name of
 * three or more words, any of its words followed by its last word, the way a person is usually named
 * ("Louis-Hector Berlioz" as "Hector Berlioz", "Ulrich Hans Walter" as "Ulrich Walter"). A stopword never leads a
 * shortened form, so the title "My Gorgeous Life" is not named by "my life".
 */
export const goldAliases = (gold: string): ReadonlySet<string> => {
    const words = normalizeAnswer(gold).split(' ');
    const named = words.filter((word) => !honorifics.has(word));
    return new Set(
        [words.join(' '), named.join(' '), ...shortenedNames(gold, named)].filter((alias) => alias.length > 0),
    );
};

/**
 * "yes" or "no" used as an answer: set off by punctuation, markup or the end of the sentence ("No, it ended",
 * "**The Ring: Probably yes**"), never quoted ('neither "no" nor "yes"') and never a determiner ("no sources").
 */
const answerParticle = /(?<!["“'‘])\b(yes|no)\b(?=\s*(?:[,.;:!)*]|$))/iu;

type Polarity = 'yes' | 'no';

const asPolarity = (word: string | undefined): Polarity | null => {
    const lowerCased = word?.toLowerCase();
    return lowerCased === 'yes' || lowerCased === 'no' ? lowerCased : null;
};

/** The first yes or no the answer commits to, if any. */
const polarityOf = (committed: readonly string[]): Polarity | null =>
    committed.map((sentence) => asPolarity(answerParticle.exec(sentence)?.[1])).find((polarity) => polarity !== null) ??
    null;

/**
 * The sentences that neither decline nor report a failure: what a declining sentence names ("no passages about A or
 * B") is not an answer.
 */
const committedSentences = (answer: string): readonly string[] =>
    answerSentences(answer).filter((sentence) => !acknowledgesFailure(sentence));

const namesAlias = (sentence: string, aliases: ReadonlySet<string>): boolean => {
    const padded = ` ${normalizeAnswer(sentence)} `;
    return [...aliases].some((alias) => padded.includes(` ${alias} `));
};

/**
 * The answer's last step opens by abstaining: it commits to nothing, even when it later offers a guess. Only the
 * last step counts: "I could not retrieve anything. I'll retry." before a successful retry is not the answer.
 */
export const opensByDeclining = (answerText: string): boolean => isAbstention(firstSentence(lastStepText(answerText)));

/**
 * Whether some sentence of the answer that neither declines nor reports a failure names the gold answer, wherever
 * the answer opens. Naming the question's options while declining ("no passages about Hot Girls Wanted or China
 * Blue") is not naming the gold "China Blue". A yes/no gold is compared with the first answer particle; `null` when
 * there is none. Any other gold must appear as whole words, under one of its aliases (`goldAliases`).
 */
export const namesGoldAnswer = (question: Pick<CorpusQuestion, 'answer'>, answerText: string): boolean | null => {
    const committed = committedSentences(answerText);
    const gold = normalizeAnswer(question.answer);
    const goldPolarity = asPolarity(gold);
    if (goldPolarity !== null) {
        const polarity = polarityOf(committed);
        return polarity === null ? null : polarity === goldPolarity;
    }
    const aliases = goldAliases(question.answer);
    return committed.some((sentence) => namesAlias(sentence, aliases));
};

/**
 * Whether the answer commits to the gold answer: `false` when it opens by declining (`opensByDeclining`), else
 * `namesGoldAnswer`. A known limit: for a gold that is one of the options the question names, an answer naming both
 * options in one committed sentence counts as found whichever it chose.
 */
export const goldAnswerFound = (question: Pick<CorpusQuestion, 'answer'>, answerText: string): boolean | null =>
    opensByDeclining(answerText) ? false : namesGoldAnswer(question, answerText);
