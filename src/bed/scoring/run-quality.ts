import type { CorpusQuestion } from '../../corpus/index.ts';
import { unitIntervalSchema, type RunView } from '../../trace/index.ts';
import type { RunQuality } from '../model.ts';
import { goldAnswerFound } from './gold-answer.ts';

/** The gold supporting sentences, trimmed, deduplicated, in dataset order. */
const goldSentences = (question: Pick<CorpusQuestion, 'paragraphs' | 'supportingFacts'>): readonly string[] => [
    ...new Set(
        question.supportingFacts.flatMap((fact) => {
            const sentence = question.paragraphs
                .find((paragraph) => paragraph.sourceId === fact.sourceId)
                ?.sentences[fact.sentenceIndex]?.trim();
            return sentence === undefined || sentence.length === 0 ? [] : [sentence];
        }),
    ),
];

/**
 * Share of gold supporting sentences that occur in a row any retrieval of the run returned, by text, so it means
 * the same under every document layout. `null` when no retrieval returned a row list at all.
 */
export const goldSentenceRecall = (
    question: Pick<CorpusQuestion, 'paragraphs' | 'supportingFacts'>,
    view: RunView,
): RunQuality['goldSentenceRecall'] => {
    const rowLists = view.retrievals.flatMap((call) => (call.retrieved.kind === 'rows' ? [call.retrieved.hits] : []));
    const sentences = goldSentences(question);
    if (rowLists.length === 0 || sentences.length === 0) {
        return null;
    }
    const retrievedTexts = rowLists.flat().map((hit) => hit.text);
    const found = sentences.filter((sentence) => retrievedTexts.some((text) => text.includes(sentence)));
    return unitIntervalSchema.parse(found.length / sentences.length);
};

export const runQuality = (question: CorpusQuestion, view: RunView): RunQuality => ({
    goldAnswerFound: goldAnswerFound(question, view.rootAgentRun.outputText),
    goldSentenceRecall: goldSentenceRecall(question, view),
});
