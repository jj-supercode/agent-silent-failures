import { corpusQuestionSchema, type CorpusQuestion } from './model.ts';

/** A valid corpus question with one two-sentence paragraph per title; the first two titles are gold. */
export const sampleQuestion = (
    id: string,
    paragraphTitles: readonly string[],
    overrides: Partial<CorpusQuestion> = {},
): CorpusQuestion =>
    corpusQuestionSchema.parse({
        id,
        question: `What links ${paragraphTitles.join(' and ')}?`,
        answer: 'yes',
        type: 'comparison',
        level: 'hard',
        supportingFacts: paragraphTitles.slice(0, 2).map((sourceId) => ({ sourceId, sentenceIndex: 0 })),
        paragraphs: paragraphTitles.map((sourceId) => ({
            sourceId,
            sentences: [`${sourceId} is a place.`, ' It has a river.'],
        })),
        ...overrides,
    });
