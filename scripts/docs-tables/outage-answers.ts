import { namesGoldAnswer, opensByDeclining } from '../../src/bed/index.ts';
import { harnessRunViewOptions, type VariationId } from '../../src/catalog/index.ts';
import type { CorpusQuestion, QuestionId } from '../../src/corpus/index.ts';
import type { FixtureSet, RecordedRun } from '../../src/record/index.ts';
import { callFailed } from '../../src/text/tool-failures.ts';
import { toRunView, type RunView } from '../../src/trace/index.ts';

import { multiAgentSearchOutage, searchOutage } from './lesson-subjects.ts';

/** The clean variations where every search fails: what a model does when its retrieval is down. */
const outageVariations: readonly VariationId[] = [searchOutage, multiAgentSearchOutage];

/** How the final answers of one outage variation's recorded runs behaved, read from their traces. */
export type OutageAnswers = {
    readonly variation: VariationId;
    readonly runs: number;
    /** The answer's last step opens by abstaining. */
    readonly declined: number;
    /** Declined, yet a later sentence still names the gold answer: a guess offered after declining. */
    readonly declinedButNamedGold: number;
    /** Did not decline, and some tool call of the run worked (the outage hits search only). */
    readonly answeredFromWorkingCalls: number;
    /** Did not decline, and every tool call of the run failed. */
    readonly answeredWithoutWorkingCalls: number;
};

type AnswerKind = 'declined' | 'declined-but-named-gold' | 'answered-from-working-calls' | 'answered-without';

const answerKind = (view: RunView, question: CorpusQuestion): AnswerKind => {
    const answer = view.rootAgentRun.outputText;
    if (opensByDeclining(answer)) {
        return namesGoldAnswer(question, answer) === true ? 'declined-but-named-gold' : 'declined';
    }
    return view.toolCalls.some((call) => !callFailed(call)) ? 'answered-from-working-calls' : 'answered-without';
};

const outageVariationOf = (run: RecordedRun): VariationId | undefined => {
    const { condition } = run.labels;
    return condition.kind === 'clean'
        ? outageVariations.find((variation) => variation === condition.variation)
        : undefined;
};

const kindOf = (run: RecordedRun, questions: ReadonlyMap<QuestionId, CorpusQuestion>): AnswerKind | undefined => {
    const question = questions.get(run.labels.questionId);
    if (run.outcome.kind !== 'completed' || question === undefined) {
        return undefined;
    }
    const mapped = toRunView(run.outcome.trace.spans, harnessRunViewOptions);
    return mapped.kind === 'run' ? answerKind(mapped.view, question) : undefined;
};

const tally = (variation: VariationId, kinds: readonly AnswerKind[]): OutageAnswers => {
    const counted = (kind: AnswerKind) => kinds.filter((candidate) => candidate === kind).length;
    return {
        variation,
        runs: kinds.length,
        declined: counted('declined') + counted('declined-but-named-gold'),
        declinedButNamedGold: counted('declined-but-named-gold'),
        answeredFromWorkingCalls: counted('answered-from-working-calls'),
        answeredWithoutWorkingCalls: counted('answered-without'),
    };
};

/** One tally per outage variation over the recorded runs of a fixture set. */
export const outageAnswers = (fixtures: FixtureSet, corpus: readonly CorpusQuestion[]): readonly OutageAnswers[] => {
    const questions = new Map(corpus.map((question) => [question.id, question]));
    return outageVariations.map((variation) =>
        tally(
            variation,
            fixtures.runs
                .filter((run) => outageVariationOf(run) === variation)
                .flatMap((run) => kindOf(run, questions) ?? []),
        ),
    );
};
