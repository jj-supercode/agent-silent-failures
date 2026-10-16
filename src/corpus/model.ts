import { z } from 'zod';

import { sourceIdSchema } from '../trace/model.ts';

export const questionIdSchema = z.string().min(1).brand<'QuestionId'>();
export type QuestionId = z.infer<typeof questionIdSchema>;

export const questionTypeSchema = z.enum(['bridge', 'comparison']);
export type QuestionType = z.infer<typeof questionTypeSchema>;

export const paragraphSchema = z.object({
    sourceId: sourceIdSchema,
    sentences: z.array(z.string()).min(1).readonly(),
});
export type Paragraph = z.infer<typeof paragraphSchema>;

export const supportingFactSchema = z.object({
    sourceId: sourceIdSchema,
    sentenceIndex: z.int().nonnegative(),
});
export type SupportingFact = z.infer<typeof supportingFactSchema>;

/** One line of `data/hotpotqa/questions.jsonl`. */
export const corpusQuestionSchema = z.object({
    id: questionIdSchema,
    question: z.string().min(1),
    answer: z.string().min(1),
    type: questionTypeSchema,
    level: z.enum(['easy', 'medium', 'hard']),
    supportingFacts: z.array(supportingFactSchema).min(1).readonly(),
    paragraphs: z.array(paragraphSchema).min(1).readonly(),
});
export type CorpusQuestion = z.infer<typeof corpusQuestionSchema>;

/** A document handed to ingestion. Its `sourceId` is what a retrieved chunk of it is attributed to. */
export const sourceDocumentSchema = z.object({ sourceId: sourceIdSchema, text: z.string() }).readonly();
export type SourceDocument = z.infer<typeof sourceDocumentSchema>;

export type CorpusLoadFailure =
    | { readonly kind: 'unreadable'; readonly path: string; readonly reason: string }
    | { readonly kind: 'invalid'; readonly path: string; readonly lineNumber: number; readonly issues: string };

export type CorpusLoadResult =
    | { readonly kind: 'loaded'; readonly questions: readonly CorpusQuestion[] }
    | { readonly kind: 'failed'; readonly failure: CorpusLoadFailure };
