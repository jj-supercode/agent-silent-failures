import type { MultiAgentHarnessFailure } from '../harness/index.ts';

export class StudioHarnessStartError extends Error {
    override readonly name = 'StudioHarnessStartError';
    readonly failure: MultiAgentHarnessFailure;

    constructor(failure: MultiAgentHarnessFailure) {
        super(`the Studio harness failed to start: ${JSON.stringify(failure)}`);
        this.failure = failure;
    }
}

/** A fault preset the session cannot run: an unknown id, or a scripted-only preset in live mode. */
export class StudioFaultRefusedError extends Error {
    override readonly name = 'StudioFaultRefusedError';

    constructor(reason: string) {
        super(`Studio refused to start: ${reason}`);
    }
}
