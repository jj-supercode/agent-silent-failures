import type { CorpusQuestion } from '../../corpus/index.ts';
import type { Split } from '../model.ts';
import { seedFor } from './seeds.ts';

/** 16 of the 40 questions for dev, the other 24 held out: the larger share goes to the numbers that get published. */
export const devQuestionCount = 16;

/** Fixed forever: changing it would move questions between dev and held-out. */
const splitSalt = 'question-split-v1';

/** Questions ordered by a salted hash of their id, then cut: deterministic, disjoint, unrelated to file order. */
export const questionsOf = (questions: readonly CorpusQuestion[], split: Split): readonly CorpusQuestion[] => {
    const ordered = questions.toSorted(
        (left, right) =>
            seedFor([splitSalt, left.id]) - seedFor([splitSalt, right.id]) || left.id.localeCompare(right.id),
    );
    return split === 'dev' ? ordered.slice(0, devQuestionCount) : ordered.slice(devQuestionCount);
};
