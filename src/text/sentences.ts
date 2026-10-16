const sentenceBoundary = /(?<=[.!?])\s+/;

/** A text split after `.`, `!` or `?` followed by whitespace, trimmed, empty pieces dropped. Abbreviations split too. */
export const sentences = (text: string): readonly string[] =>
    text
        .split(sentenceBoundary)
        .map((sentence) => sentence.trim())
        .filter((sentence) => sentence.length > 0);

/** The first sentence of a text, or the whole trimmed text when it has no boundary. */
export const firstSentence = (text: string): string => sentences(text)[0] ?? text.trim();
