import { countText, percentText } from '../../src/command-output/index.ts';
import { mastraDefaultChunking } from '../../src/harness/index.ts';
import { boundarySentence, windowCharacters } from './default-stack-facts.ts';
import { reproProvenance } from './provenance-text.ts';
import type { HeadlineInput } from './render-headline.ts';

/**
 * The embedding-coverage page's account of the default stack, from the same repro reports as the README headline:
 * library defaults, the window in tokens and characters, and the corpus split by document length.
 */
export const defaultStackBlock = (input: Pick<HeadlineInput, 'book' | 'corpus'>): string => {
    const { versions } = input.corpus.report;
    const { questionLevel, paragraphLevel } = input.corpus.evidence;
    return (
        `With Mastra's defaults this happens out of the box: \`@mastra/rag\` ${versions['@mastra/rag'] ?? ''} chunks to ` +
        `${countText(mastraDefaultChunking.maxSize)} characters (recursive, ${countText(mastraDefaultChunking.overlap)} ` +
        `overlap) and \`@mastra/fastembed\` ${versions['@mastra/fastembed'] ?? ''} embeds the first ` +
        `${countText(input.book.evidence.window.tokens)} tokens of each input, about ` +
        `${countText(windowCharacters(input.book.evidence))} characters of English prose. On this repository's ` +
        `question-level documents (median ${countText(questionLevel.documentCharacters.median)} characters), ` +
        `${countText(questionLevel.defaultChunks.overflowingCount)} of ${countText(questionLevel.defaultChunks.chunkCount)} ` +
        `default chunks overflow and ${percentText(questionLevel.defaultChunks.tokensBeyondWindowShare)} of all chunk ` +
        `tokens are never embedded. Per-paragraph documents (median ${countText(paragraphLevel.documentCharacters.median)} ` +
        `characters) give ${countText(paragraphLevel.defaultChunks.overflowingCount)} of ` +
        `${countText(paragraphLevel.defaultChunks.chunkCount)}. ${boundarySentence(input.corpus.evidence)} Source: ` +
        `\`pnpm repros fastembed-truncation-hotpotqa fastembed-truncation\`, ${reproProvenance(input.corpus.report)}.`
    );
};
