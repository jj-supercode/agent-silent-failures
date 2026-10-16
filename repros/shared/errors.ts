/**
 * The repro could not set up the situation it observes (no trace id, no stored trace, a probe that never ran).
 * Thrown so the run exits as broken: reporting it as "not reproduced" would read as "fixed upstream".
 */
export class ReproSetupError extends Error {
    override readonly name = 'ReproSetupError';
}

/** Thrown on purpose by a control scorer, to show that Mastra prints a scorer that fails while scoring. */
export class ControlScorerError extends Error {
    override readonly name = 'ControlScorerError';
}
