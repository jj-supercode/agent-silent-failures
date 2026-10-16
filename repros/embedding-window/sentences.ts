export type LocatedSentence = {
    readonly text: string;
    readonly start: number;
    readonly end: number;
};

const sentencePattern = /[^.!?]+[.!?]+/g;
const minQueryWords = 15;
const maxQueryWords = 60;

const wordCount = (text: string): number => text.split(/\s+/).filter((word) => word.length > 0).length;

/** Sentences of a chunk with their character offsets; whitespace inside a sentence is collapsed in `text` only. */
export const locatedSentences = (chunkText: string): readonly LocatedSentence[] =>
    Array.from(chunkText.matchAll(sentencePattern), (match) => {
        const leadingWhitespace = match[0].length - match[0].trimStart().length;
        const start = match.index + leadingWhitespace;
        return { text: match[0].trim().replace(/\s+/g, ' '), start, end: match.index + match[0].length };
    });

/** Long enough to be distinctive, short enough to read as a single question-like query. */
export const isQueryCandidate = (sentence: LocatedSentence): boolean => {
    const words = wordCount(sentence.text);
    return words >= minQueryWords && words <= maxQueryWords;
};

const fragmentLength = 40;

const normalizedWhitespace = (text: string): string => text.replace(/\s+/g, ' ');

/** A chunk covers a sentence when it holds the sentence's opening or closing fragment. */
export const chunkCoversSentence = (chunkText: string, sentenceText: string): boolean => {
    const chunk = normalizedWhitespace(chunkText);
    return chunk.includes(sentenceText.slice(0, fragmentLength)) || chunk.includes(sentenceText.slice(-fragmentLength));
};
