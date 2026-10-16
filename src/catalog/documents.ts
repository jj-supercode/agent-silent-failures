import { toQuestionDocuments, toSourceDocuments, type CorpusQuestion, type SourceDocument } from '../corpus/index.ts';
import { sourceIdSchema } from '../trace/index.ts';
import type { DocumentLayout, RunSetting } from './model.ts';

/** Every paragraph a second time under its own source id, so its chunks tie exactly with the original's. */
const duplicatedParagraphs = (questions: readonly CorpusQuestion[]): readonly SourceDocument[] =>
    toSourceDocuments(questions).flatMap((document) => [
        document,
        { sourceId: sourceIdSchema.parse(`${document.sourceId} (copy)`), text: document.text },
    ]);

export const documentsFor = (
    layout: DocumentLayout,
    questions: readonly CorpusQuestion[],
): readonly SourceDocument[] => {
    switch (layout) {
        case 'paragraphs':
            return toSourceDocuments(questions);
        case 'duplicated-paragraphs':
            return duplicatedParagraphs(questions);
        case 'question-contexts':
            return toQuestionDocuments(questions);
        default:
            return layout satisfies never;
    }
};

/** The multi-agent workers page through paragraph sources, so that setting always ingests paragraphs. */
export const documentLayoutOf = (setting: RunSetting): DocumentLayout =>
    setting.harness === 'single-agent' ? setting.documents : 'paragraphs';
