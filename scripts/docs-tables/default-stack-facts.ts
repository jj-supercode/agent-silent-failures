import { countText } from '../../src/command-output/index.ts';
import type { BookTruncationEvidence, CorpusTruncationEvidence } from './model.ts';

/** Window sizes in characters are estimates, so the prose rounds them to the nearest hundred. */
const characterRounding = 100;

/** Characters per embedder token, averaged over the book's default chunks. */
export const charactersPerToken = ({ defaultChunks }: BookTruncationEvidence): number =>
    defaultChunks.characters.mean / defaultChunks.bgeContentTokens.mean;

/** About how many characters of English prose fit the embedder window, at the measured characters per token. */
export const windowCharacters = (evidence: BookTruncationEvidence): number =>
    Math.round((evidence.window.contentTokens * charactersPerToken(evidence)) / characterRounding) * characterRounding;

/**
 * Where document length starts to matter on this corpus. The strong form holds only when the two lengths separate
 * every document; otherwise both are stated as they are.
 */
export const boundarySentence = ({ lengthBoundary }: CorpusTruncationEvidence): string => {
    const longestFitting = lengthBoundary.longestDocumentWithoutOverflow;
    const shortestOverflowing = lengthBoundary.shortestDocumentWithAnOverflowingChunk;
    return longestFitting < shortestOverflowing
        ? `On this repository's corpus no document of ${countText(longestFitting)} characters or fewer overflowed, and ` +
              `every document of ${countText(shortestOverflowing)} or more did.`
        : `On this repository's corpus the shortest document with an overflowing chunk has ` +
              `${countText(shortestOverflowing)} characters and the longest without one ${countText(longestFitting)}.`;
};
