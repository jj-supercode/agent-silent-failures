import { sourceIdSchema } from '../trace/model.ts';
import type { CorpusQuestion, Paragraph, SourceDocument } from './model.ts';

/** HotpotQA sentences carry their own leading spaces, so joining with no separator restores the paragraph. */
export const paragraphText = (paragraph: Paragraph): string => paragraph.sentences.join('');

/** One document per distinct source, in first-seen order; a source repeated across questions is ingested once. */
export const toSourceDocuments = (questions: readonly CorpusQuestion[]): readonly SourceDocument[] =>
    Map.groupBy(
        questions.flatMap((question) => question.paragraphs),
        (paragraph) => paragraph.sourceId,
    )
        .values()
        .flatMap(([firstSeen]) => (firstSeen === undefined ? [] : [firstSeen]))
        .map((paragraph) => ({ sourceId: paragraph.sourceId, text: paragraphText(paragraph) }))
        .toArray();

/**
 * One document per question: its context paragraphs in dataset order, each headed by its title. These run to about
 * 6,000 characters (median), long enough for Mastra's 4,000-character default chunks to exceed a 512-token embedder.
 * Chunks then span several paragraphs, so they are attributed to `question:<id>`, not to a title.
 */
export const toQuestionDocuments = (questions: readonly CorpusQuestion[]): readonly SourceDocument[] =>
    questions.map((question) => ({
        sourceId: sourceIdSchema.parse(`question:${question.id}`),
        text: question.paragraphs.map((paragraph) => `${paragraph.sourceId}\n${paragraphText(paragraph)}`).join('\n\n'),
    }));
