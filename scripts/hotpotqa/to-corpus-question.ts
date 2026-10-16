import type { HotpotSourceRow } from './source-row.ts';

/** Reshapes a source row into the committed camelCase record; validation happens against `corpusQuestionSchema`. */
export const toCorpusQuestionRecord = (row: HotpotSourceRow) => ({
    id: row.id,
    question: row.question,
    answer: row.answer,
    type: row.type,
    level: row.level,
    supportingFacts: row.supporting_facts.title.map((sourceId, index) => ({
        sourceId,
        sentenceIndex: row.supporting_facts.sent_id[index],
    })),
    paragraphs: row.context.title.map((sourceId, index) => ({
        sourceId,
        sentences: row.context.sentences[index],
    })),
});
