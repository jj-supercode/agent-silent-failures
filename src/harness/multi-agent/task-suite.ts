import type { CorpusQuestion } from '../../corpus/index.ts';
import type { SourceId } from '../../trace/index.ts';
import type { SupervisorTask } from './model.ts';

/** The gold sources in the order the dataset's supporting facts first name them. */
const goldSources = (question: CorpusQuestion): readonly SourceId[] => [
    ...new Set(question.supportingFacts.map((fact) => fact.sourceId)),
];

/** A question becomes a task when it has exactly two gold sources (HotpotQA's design); others are skipped. */
export const toSupervisorTask = (question: CorpusQuestion): SupervisorTask | null => {
    const [first, second, ...rest] = goldSources(question);
    return first === undefined || second === undefined || rest.length > 0
        ? null
        : { questionId: question.id, question: question.question, subjects: [first, second] };
};

export const toSupervisorTasks = (questions: readonly CorpusQuestion[]): readonly SupervisorTask[] =>
    questions.flatMap((question) => toSupervisorTask(question) ?? []);
