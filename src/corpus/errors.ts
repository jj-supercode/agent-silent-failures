import type { CorpusLoadFailure } from './model.ts';

export const corpusLoadFailureText = (failure: CorpusLoadFailure): string => {
    switch (failure.kind) {
        case 'unreadable':
            return `cannot read ${failure.path}: ${failure.reason}`;
        case 'invalid':
            return `${failure.path} line ${failure.lineNumber}: ${failure.issues}`;
        default:
            return failure satisfies never;
    }
};

export class CorpusLoadError extends Error {
    override readonly name = 'CorpusLoadError';
    readonly failure: CorpusLoadFailure;

    constructor(failure: CorpusLoadFailure) {
        super(corpusLoadFailureText(failure));
        this.failure = failure;
    }
}
