import { countText, percentText } from '../../src/command-output/index.ts';
import { mastraDefaultChunking } from '../../src/harness/index.ts';
import type {
    BookTruncationEvidence,
    CorpusTruncationEvidence,
    FaultCatch,
    MemoryTruncationEvidence,
    ReproReport,
} from './model.ts';
import { catchText, proportionText } from './number-text.ts';
import { boundarySentence, charactersPerToken, windowCharacters } from './default-stack-facts.ts';
import { reproProvenance } from './provenance-text.ts';

export type HeadlineInput = {
    readonly book: { readonly report: ReproReport; readonly evidence: BookTruncationEvidence };
    readonly corpus: { readonly report: ReproReport; readonly evidence: CorpusTruncationEvidence };
    readonly memory: { readonly report: ReproReport; readonly evidence: MemoryTruncationEvidence };
    /** embedding-coverage on the held-out ingestions of the fault that reproduces Mastra's default stack. */
    readonly defaultStackCatch: (FaultCatch & { readonly faultId: string }) | undefined;
    readonly bedProvenance: string;
};

const introParagraph = (book: BookTruncationEvidence, corpus: CorpusTruncationEvidence): string =>
    'Two Mastra defaults disagree, silently. Each behaves as designed: `@mastra/rag` chunks to ' +
    `${countText(mastraDefaultChunking.maxSize)} characters by default, which suits an embedder with a large input ` +
    "window such as `openai/text-embedding-3-small`, the model Mastra's chunking docs use; `@mastra/fastembed` " +
    `embeds the first ${countText(book.window.tokens)} tokens of each input, the window of \`bge-small-en-v1.5\`, and ` +
    'truncates the rest as fastembed and Sentence-Transformers do. Combined, every default chunk longer than the ' +
    'window loses its tail, and `doEmbed` returns no warning. At the ' +
    `${charactersPerToken(book).toFixed(1)} characters per token measured on the book below, that window holds ` +
    `about ${countText(windowCharacters(book))} characters of English prose. ${boundarySentence(corpus)} The tail's ` +
    "words never reach the vector, and nothing in Mastra's logs or traces says so.";

const bookLine = ({ evidence }: HeadlineInput['book']): string => {
    const { defaultChunks, retrieval } = evidence;
    return (
        `- **A long public-domain text** (_On the Origin of Species_, ${countText(evidence.corpusCharacters)} characters): ` +
        `${countText(defaultChunks.overflowingCount)} of ${countText(defaultChunks.count)} default chunks overflow the window ` +
        `(median ${countText(defaultChunks.bgeContentTokens.median)} tokens). The tail past the window is never embedded: a ` +
        `median ${percentText(defaultChunks.neverEmbeddedCharacterShareOfOverflowingChunk.median)} of each overflowing chunk, ` +
        `${percentText(defaultChunks.neverEmbeddedCharacterShareOfCorpus)} of the corpus. A sentence copied from a ` +
        "chunk's tail can find that chunk only through what the chunk's head says: the chunk is in the top " +
        `${retrieval.topK} for ${proportionText(retrieval.defaultChunksTailSentences.hitAtTopK)} of such queries, ` +
        `against ${proportionText(retrieval.defaultChunksHeadSentences.hitAtTopK)} for sentences from a chunk's head ` +
        `and ${proportionText(retrieval.fittingChunksSameTailSentences.hitAtTopK)} for the same tail sentences once ` +
        'the text is chunked to fit.'
    );
};

const corpusLine = ({ evidence }: HeadlineInput['corpus']): string => {
    const { questionLevel, paragraphLevel } = evidence;
    return (
        `- **This repository's HotpotQA subsample:** question-level contexts (median ` +
        `${countText(questionLevel.documentCharacters.median)} characters) give ` +
        `${countText(questionLevel.defaultChunks.overflowingCount)} of ${countText(questionLevel.defaultChunks.chunkCount)} ` +
        `default chunks over the window and ${percentText(questionLevel.defaultChunks.tokensBeyondWindowShare)} of tokens ` +
        `beyond it. Per-paragraph documents (median ${countText(paragraphLevel.documentCharacters.median)} characters) give ` +
        `${countText(paragraphLevel.defaultChunks.overflowingCount)} of ${countText(paragraphLevel.defaultChunks.chunkCount)}.`
    );
};

const memoryLine = (memory: HeadlineInput['memory'], window: BookTruncationEvidence['window']): string =>
    `- **Mastra Memory semantic recall** with \`embedder: fastembed\` (top ${memory.evidence.recallTopK}) finds a long ` +
    `message from a sentence in its first ${countText(window.tokens)} tokens for ` +
    `${proportionText(memory.evidence.queriesFromEmbeddedRegion)}, and from a sentence after them for ` +
    `${proportionText(memory.evidence.queriesFromNeverEmbeddedRegion)}.`;

const defaultStackLine = (defaultStackCatch: HeadlineInput['defaultStackCatch']): string =>
    defaultStackCatch === undefined
        ? '- The bed has no held-out ingestions of the default-stack fault to report.'
        : `- **The \`embedding-coverage\` canary** flags the ingestion: held-out \`${defaultStackCatch.faultId}\` ` +
          `ingestions caught ${catchText(defaultStackCatch)}. Whether a run lost text is measured apart from the ` +
          'canary: the bed embeds each chunk and its head cut at the window, and the tail was lost when both give the ' +
          'same vector. Where every document fits, nothing was lost and the canary correctly stayed clear.';

const fixParagraph = ({ fittingControl }: BookTruncationEvidence): string =>
    'Short documents are not affected: per-paragraph documents under the same defaults do not overflow. The fix on ' +
    `the user side is a smaller \`maxSize\`: chunked to ${countText(fittingControl.maxSize)} characters, ` +
    `${countText(fittingControl.overflowingCount)} of the book's ${countText(fittingControl.count)} chunks pass the window ` +
    `(the largest has ${countText(fittingControl.bgeContentTokens.max)} tokens). The upstream fix is a warning, written ` +
    'up in [Findings in Mastra](docs/findings-in-mastra.md).';

/** One provenance when the three repros ran together; each repro's own when one was regenerated apart. */
const reprosProvenance = (input: HeadlineInput): string => {
    const reports = [input.book.report, input.corpus.report, input.memory.report];
    const provenances = new Set(reports.map(reproProvenance));
    return provenances.size === 1
        ? `Repro numbers: ${reproProvenance(input.book.report)}.`
        : `Repro numbers: ${reports.map((report) => `${report.reproductionId}: ${reproProvenance(report)}`).join('; ')}.`;
};

/** The README lead: every number comes from the repro reports and the bed report passed in. */
export const headlineBlock = (input: HeadlineInput): string =>
    [
        introParagraph(input.book.evidence, input.corpus.evidence),
        '',
        bookLine(input.book),
        corpusLine(input.corpus),
        memoryLine(input.memory, input.book.evidence.window),
        defaultStackLine(input.defaultStackCatch),
        '',
        fixParagraph(input.book.evidence),
        '',
        `${reprosProvenance(input)} Bed numbers: ${input.bedProvenance}.`,
    ].join('\n');
