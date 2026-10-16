import type { CommandFailure } from '../../command-output/index.ts';
import { corpusLoadFailureText, type CorpusLoadFailure } from '../../corpus/index.ts';

/** The question corpus is committed, so an unreadable one means an incomplete or edited checkout. */
export const corpusFailure = (failure: CorpusLoadFailure): CommandFailure => ({
    subject: null,
    what: 'cannot read the question corpus',
    why: corpusLoadFailureText(failure),
    fix: 'restore data/hotpotqa/ from the repository; the corpus is committed and every number depends on it',
});
