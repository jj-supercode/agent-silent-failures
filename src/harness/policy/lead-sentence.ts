import { sentences } from '../../text/sentences.ts';

/** A piece shorter than this is an abbreviation cut off by the sentence splitter ("Prof.", "Dr."), not a sentence. */
const minLeadWords = 4;

const wordCount = (text: string): number => text.split(/\s+/).filter((word) => word.length > 0).length;

/**
 * The first sentence of a text as a reader would quote it: pieces the splitter cut after an abbreviation are joined
 * to what follows until the lead has a few words. The whole trimmed text when it has no boundary.
 */
export const leadSentence = (text: string): string =>
    sentences(text).reduce(
        (lead, sentence) => (wordCount(lead) >= minLeadWords ? lead : `${lead} ${sentence}`.trim()),
        '',
    ) || text.trim();
