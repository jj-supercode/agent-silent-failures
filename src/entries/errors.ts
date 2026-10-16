export class UnknownThresholdError extends Error {
    override readonly name = 'UnknownThresholdError';
    readonly thresholdName: string;

    constructor(thresholdName: string, knownNames: readonly string[]) {
        super(`no threshold named ${thresholdName}; known: ${knownNames.join(', ')}`);
        this.thresholdName = thresholdName;
    }
}

export class InvalidThresholdValueError extends Error {
    override readonly name = 'InvalidThresholdValueError';
    readonly thresholdName: string;

    constructor(thresholdName: string, value: unknown) {
        super(`threshold ${thresholdName} must be a finite number, got ${String(value)}`);
        this.thresholdName = thresholdName;
    }
}

export class ScorerWithoutMastraError extends Error {
    override readonly name = 'ScorerWithoutMastraError';

    /** Takes the id as text, so this module depends on nothing and `contract.ts` can import it without a cycle. */
    constructor(scorerId: string) {
        super(`scorer ${scorerId} reads stored traces, so it must be registered on a Mastra instance with storage`);
    }
}
