import { loadBgeTokenCounter, type TokenCoverage } from './bge-tokenizer.ts';
import { isQueryCandidate, locatedSentences, type LocatedSentence } from './sentences.ts';

export type MeasuredChunk = { readonly text: string; readonly coverage: TokenCoverage };

/** `embedded`: inside the first 512 tokens fastembed keeps. `never-embedded`: after the cut. */
export type ChunkRegion = 'embedded' | 'never-embedded';

export const measureChunks = async (texts: readonly string[]): Promise<readonly MeasuredChunk[]> => {
    const counter = await loadBgeTokenCounter();
    return Promise.all(texts.map(async (text) => ({ text, coverage: await counter.coverageOf(text) })));
};

export const isOverflowing = (chunk: MeasuredChunk): boolean =>
    chunk.coverage.embeddedCharacters < chunk.coverage.characters;

const isInRegion = (sentence: LocatedSentence, chunk: MeasuredChunk, region: ChunkRegion): boolean => {
    switch (region) {
        case 'embedded':
            return sentence.end <= chunk.coverage.embeddedCharacters;
        case 'never-embedded':
            return sentence.start >= chunk.coverage.embeddedCharacters;
        default:
            return region satisfies never;
    }
};

const appearsInExactlyOneChunk = (sentence: string, chunks: readonly MeasuredChunk[]): boolean =>
    chunks.filter((chunk) => chunk.text.replace(/\s+/g, ' ').includes(sentence)).length === 1;

export type RegionSentence = { readonly sentence: string; readonly chunkIndex: number };

/**
 * Query-sized sentences that lie wholly inside `region` of an overflowing chunk and occur in no other chunk,
 * so chunk overlap cannot make a never-embedded sentence retrievable through a neighbour.
 */
export const sentencesInRegion = (chunks: readonly MeasuredChunk[], region: ChunkRegion): readonly RegionSentence[] =>
    chunks
        .flatMap((chunk, chunkIndex) =>
            isOverflowing(chunk)
                ? locatedSentences(chunk.text)
                      .filter((sentence) => isQueryCandidate(sentence) && isInRegion(sentence, chunk, region))
                      .map((sentence) => ({ sentence: sentence.text, chunkIndex }))
                : [],
        )
        .filter(({ sentence }) => appearsInExactlyOneChunk(sentence, chunks));
