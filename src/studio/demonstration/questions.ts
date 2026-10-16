import { questionsOf } from '../../bed/index.ts';
import type { CorpusQuestion } from '../../corpus/index.ts';
import { renderTaskMessage, toSupervisorTask } from '../../harness/index.ts';
import { NoDemonstrationQuestionsError } from './errors.ts';

/** A few questions keep a live matrix cheap; each preset asks every one of them. */
export const demonstrationQuestionCount = 3;

/** One question as both agents are asked it: the plain question, and the supervisor's task message. */
export type DemonstrationQuestion = {
    readonly question: CorpusQuestion;
    readonly supervisorMessage: string;
};

export type DemonstrationQuestions = readonly [DemonstrationQuestion, ...DemonstrationQuestion[]];

/** The first held-out questions that also make a two-subject supervisor task, so both agents get the same ones. */
export const demonstrationQuestions = (corpus: readonly CorpusQuestion[]): readonly DemonstrationQuestion[] =>
    questionsOf(corpus, 'held-out')
        .flatMap((question) => {
            const task = toSupervisorTask(question);
            return task === null ? [] : [{ question, supervisorMessage: renderTaskMessage(task) }];
        })
        .slice(0, demonstrationQuestionCount);

/** The demonstration questions of a corpus that must have some: the committed one always does. */
export const requiredDemonstrationQuestions = (corpus: readonly CorpusQuestion[]): DemonstrationQuestions => {
    const [first, ...rest] = demonstrationQuestions(corpus);
    if (first === undefined) {
        throw new NoDemonstrationQuestionsError();
    }
    return [first, ...rest];
};
