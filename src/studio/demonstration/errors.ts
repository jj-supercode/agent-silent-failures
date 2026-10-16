/** The committed corpus always yields demonstration questions; none means the corpus or the selection broke. */
export class NoDemonstrationQuestionsError extends Error {
    override readonly name = 'NoDemonstrationQuestionsError';

    constructor() {
        super('the corpus has no held-out question that makes a two-subject supervisor task');
    }
}
