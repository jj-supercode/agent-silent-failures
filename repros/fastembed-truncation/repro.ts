// With Mastra's documented defaults, @mastra/fastembed silently embeds only the first
// 512 tokens of each @mastra/rag chunk, so text in the rest of the chunk can never be retrieved.
import { fastembed } from '@mastra/fastembed';
import { MDocument } from '@mastra/rag';
import { embedMany } from 'ai';

import { cosineSimilarity } from '../../src/harness/index.ts';
import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';
import {
    buildChunkIndex,
    formatEstimate,
    distributionOf,
    evenlySpacedSample,
    fastembedMaxContentTokens,
    fastembedMaxTokens,
    isOverflowing,
    loadOriginOfSpecies,
    measureChunks,
    percentText,
    retrievalTopK,
    sentencesInRegion,
    shareOf,
    type ChunkRegion,
} from '../embedding-window/index.ts';
import { ReproSetupError } from '../shared/errors.ts';

const querySampleSize = 120;
/** Chunk size for the control run: about 300 BGE tokens of this corpus, inside the 512-token window. */
const fittingChunkMaxSize = 1500;
const fittingChunkOverlap = 150;
/** Cosine at or above this means two inputs produced the same embedding (float noise only). */
const identicalEmbeddingCosine = 0.99999;
const shorterPrefixRatio = 0.75;

const embedOne = async (value: string): Promise<readonly number[]> =>
    (await embedMany({ model: fastembed, values: [value] })).embeddings[0] ?? [];

const corpus = await loadOriginOfSpecies();
const defaultChunks = await measureChunks((await MDocument.fromText(corpus).chunk()).map((chunk) => chunk.text));
const overflowing = defaultChunks.filter(isOverflowing);
const totalCharacters = defaultChunks.reduce((total, chunk) => total + chunk.coverage.characters, 0);
const neverEmbeddedCharacters = defaultChunks.reduce(
    (total, chunk) => total + chunk.coverage.characters - chunk.coverage.embeddedCharacters,
    0,
);

// Self-check that the measured cut point is fastembed's real one, then the headline mechanism.
const probeChunk = overflowing[0];
if (probeChunk === undefined) {
    throw new ReproSetupError('No default chunk exceeds the embedder window; the measurement premise does not hold');
}
const fullEmbedding = await embedOne(probeChunk.text);
const embeddedPrefix = probeChunk.text.slice(0, probeChunk.coverage.embeddedCharacters);
const shorterPrefix = probeChunk.text.slice(0, Math.floor(probeChunk.coverage.embeddedCharacters * shorterPrefixRatio));
const foreignTail =
    overflowing.at(-1)?.text.slice(-(probeChunk.coverage.characters - probeChunk.coverage.embeddedCharacters)) ?? '';
const cutPointCheck = {
    cosineFullChunkVsMeasuredPrefix: cosineSimilarity(fullEmbedding, await embedOne(embeddedPrefix)),
    cosineFullChunkVsShorterPrefix: cosineSimilarity(fullEmbedding, await embedOne(shorterPrefix)),
    cosineFullChunkVsPrefixPlusUnrelatedTail: cosineSimilarity(
        fullEmbedding,
        await embedOne(embeddedPrefix + foreignTail),
    ),
};

const sampleSentences = (region: ChunkRegion): readonly string[] =>
    evenlySpacedSample(sentencesInRegion(defaultChunks, region), querySampleSize).map(({ sentence }) => sentence);
const tailSentences = sampleSentences('never-embedded');
const headSentences = sampleSentences('embedded');

const defaultIndex = await buildChunkIndex(
    'default_chunks',
    defaultChunks.map((chunk) => chunk.text),
);
const fittingChunks = await measureChunks(
    (await MDocument.fromText(corpus).chunk({ maxSize: fittingChunkMaxSize, overlap: fittingChunkOverlap })).map(
        (chunk) => chunk.text,
    ),
);
const fittingIndex = await buildChunkIndex(
    'fitting_chunks',
    fittingChunks.map((chunk) => chunk.text),
);

const retrieval = {
    topK: retrievalTopK,
    defaultChunksHeadSentences: await defaultIndex.hitRates(headSentences),
    defaultChunksTailSentences: await defaultIndex.hitRates(tailSentences),
    fittingChunksSameTailSentences: await fittingIndex.hitRates(tailSentences),
};

const tailIsInvisible = cutPointCheck.cosineFullChunkVsPrefixPlusUnrelatedTail >= identicalEmbeddingCosine;
const tailRetrievalCollapses =
    retrieval.defaultChunksTailSentences.hitAtTopK.high < retrieval.defaultChunksHeadSentences.hitAtTopK.low &&
    retrieval.defaultChunksTailSentences.hitAtTopK.high < retrieval.fittingChunksSameTailSentences.hitAtTopK.low;

await reportOutcome(
    'fastembed-truncation',
    outcomeWhen(
        overflowing.length > 0 && tailIsInvisible && tailRetrievalCollapses,
        `${overflowing.length}/${defaultChunks.length} default chunks exceed fastembed's ${fastembedMaxTokens}-token window; ` +
            `${percentText(shareOf(neverEmbeddedCharacters, totalCharacters))} of corpus characters are never embedded; ` +
            `top-${retrievalTopK} hit rate for sentences in chunk tails is ${formatEstimate(retrieval.defaultChunksTailSentences.hitAtTopK)} ` +
            `vs ${formatEstimate(retrieval.defaultChunksHeadSentences.hitAtTopK)} for chunk heads, no warning raised`,
        {
            corpus: 'On the Origin of Species, Project Gutenberg eBook #1228, body only',
            corpusCharacters: corpus.length,
            window: { tokens: fastembedMaxTokens, contentTokens: fastembedMaxContentTokens },
            chunking: 'MDocument.fromText(corpus).chunk() with no options (recursive, maxSize 4000, overlap 200)',
            defaultChunks: {
                count: defaultChunks.length,
                characters: distributionOf(defaultChunks.map((chunk) => chunk.coverage.characters)),
                bgeContentTokens: distributionOf(defaultChunks.map((chunk) => chunk.coverage.contentTokens)),
                overflowingCount: overflowing.length,
                overflowingShare: shareOf(overflowing.length, defaultChunks.length),
                neverEmbeddedCharacterShareOfCorpus: shareOf(neverEmbeddedCharacters, totalCharacters),
                neverEmbeddedCharacterShareOfOverflowingChunk: distributionOf(
                    overflowing.map((chunk) =>
                        shareOf(
                            chunk.coverage.characters - chunk.coverage.embeddedCharacters,
                            chunk.coverage.characters,
                        ),
                    ),
                ),
            },
            cutPointCheck,
            fittingControl: {
                chunking: `chunk({ maxSize: ${fittingChunkMaxSize}, overlap: ${fittingChunkOverlap} })`,
                maxSize: fittingChunkMaxSize,
                count: fittingChunks.length,
                bgeContentTokens: distributionOf(fittingChunks.map((chunk) => chunk.coverage.contentTokens)),
                overflowingCount: fittingChunks.filter(isOverflowing).length,
            },
            retrieval,
        },
    ),
);
