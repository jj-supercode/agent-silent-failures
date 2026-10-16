import { countText, percentText } from '../../src/command-output/index.ts';
import { mastraDefaultChunking } from '../../src/harness/index.ts';
import type { BookTruncationEvidence } from './model.ts';
import { readmeAnchors } from './readme-anchors.ts';

/** The README's second line: the lead finding in one sentence, every number from the book repro. */
export const pitchBlock = ({ window, defaultChunks, retrieval }: BookTruncationEvidence): string => {
    const tailShare = retrieval.defaultChunksTailSentences.hitAtTopK;
    const headShare = retrieval.defaultChunksHeadSentences.hitAtTopK;
    return (
        `Found along the way: with Mastra's default ${countText(mastraDefaultChunking.maxSize)}-character chunks and ` +
        `\`@mastra/fastembed\` (a ${countText(window.tokens)}-token window), every chunk longer than the window silently loses its tail. ` +
        `On a long book, a median ${percentText(defaultChunks.neverEmbeddedCharacterShareOfOverflowingChunk.median)} of ` +
        `each chunk is never embedded, and a sentence from that tail brings its chunk into the top ` +
        `${retrieval.topK} results ${percentText(tailShare.successes / tailShare.trials)} of the time, against ` +
        `${percentText(headShare.successes / headShare.trials)} for a sentence from the head (scripted; [the lead finding](${readmeAnchors.leadFinding})).`
    );
};
