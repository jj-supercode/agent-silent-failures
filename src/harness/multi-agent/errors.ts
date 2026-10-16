/** A smoke or shape run could not complete: harness setup, a scenario, a trace read or trace scoring failed. */
export class SmokeRunError extends Error {
    override readonly name = 'SmokeRunError';
}
