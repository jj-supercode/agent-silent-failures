// The same default-stack truncation as `fastembed-truncation`, measured on this repository's HotpotQA subsample:
// whether a default `@mastra/rag` chunk overflows fastembed's 512-token window depends on document length. Token
// counts only (the exact fastembed tokenizer), no embeddings, so it runs in seconds.
import { MDocument } from '@mastra/rag';

import {
    CorpusLoadError,
    loadQuestions,
    toQuestionDocuments,
    toSourceDocuments,
    type SourceDocument,
} from '../../src/corpus/index.ts';
import {
    distributionOf,
    fastembedMaxTokens,
    isOverflowing,
    measureChunks,
    overflowSummary,
    percentText,
    type MeasuredChunk,
} from '../embedding-window/index.ts';
import { reportOutcome } from '../shared/report-outcome.ts';
import { outcomeWhen } from '../shared/reproduction-outcome.ts';

type MeasuredDocument = { readonly characters: number; readonly chunks: readonly MeasuredChunk[] };

const measureDocument = async (document: SourceDocument): Promise<MeasuredDocument> => ({
    characters: document.text.length,
    chunks: await measureChunks((await MDocument.fromText(document.text).chunk()).map((chunk) => chunk.text)),
});

const measureDocuments = (documents: readonly SourceDocument[]): Promise<readonly MeasuredDocument[]> =>
    Promise.all(documents.map(measureDocument));

const hasOverflow = (document: MeasuredDocument): boolean => document.chunks.some(isOverflowing);

const describe = (documents: readonly MeasuredDocument[]) => ({
    documents: documents.length,
    documentCharacters: distributionOf(documents.map((document) => document.characters)),
    defaultChunks: overflowSummary(documents.flatMap((document) => document.chunks)),
});

const loaded = await loadQuestions();
if (loaded.kind === 'failed') {
    throw new CorpusLoadError(loaded.failure);
}
const questionLevel = await measureDocuments(toQuestionDocuments(loaded.questions));
const paragraphLevel = await measureDocuments(toSourceDocuments(loaded.questions));
const everyDocument = [...questionLevel, ...paragraphLevel];

const questionLevelSummary = describe(questionLevel);
const paragraphLevelSummary = describe(paragraphLevel);
const lengthBoundary = {
    shortestDocumentWithAnOverflowingChunk: Math.min(
        ...everyDocument.filter(hasOverflow).map((document) => document.characters),
    ),
    longestDocumentWithoutOverflow: Math.max(
        ...everyDocument.filter((document) => !hasOverflow(document)).map((document) => document.characters),
    ),
};

await reportOutcome(
    'fastembed-truncation-hotpotqa',
    outcomeWhen(
        questionLevelSummary.defaultChunks.overflowingCount > 0 &&
            paragraphLevelSummary.defaultChunks.overflowingCount === 0,
        `question-level documents: ${questionLevelSummary.defaultChunks.overflowingCount}/` +
            `${questionLevelSummary.defaultChunks.chunkCount} default chunks exceed the ${fastembedMaxTokens}-token window ` +
            `(${percentText(questionLevelSummary.defaultChunks.tokensBeyondWindowShare)} of tokens never embedded); ` +
            `per-paragraph documents: ${paragraphLevelSummary.defaultChunks.overflowingCount}/` +
            `${paragraphLevelSummary.defaultChunks.chunkCount}`,
        {
            corpus: 'HotpotQA distractor dev subsample committed under data/hotpotqa (CC BY-SA 4.0)',
            chunking: 'MDocument.fromText(document).chunk() with no options (recursive, maxSize 4000, overlap 200)',
            questionLevel: questionLevelSummary,
            paragraphLevel: paragraphLevelSummary,
            lengthBoundary,
        },
    ),
);
