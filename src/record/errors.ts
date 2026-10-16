import type { SensitiveFinding } from './sensitive-strings.ts';

/** Thrown instead of writing a fixture line that looks like it holds a secret or personal data. */
export class SensitiveFixtureError extends Error {
    override readonly name = 'SensitiveFixtureError';
    readonly findings: readonly SensitiveFinding[];

    constructor(file: string, findings: readonly SensitiveFinding[]) {
        super(`refused to write ${file}: ${findings.map((finding) => `${finding.kind} (${finding.hint})`).join(', ')}`);
        this.findings = findings;
    }
}
