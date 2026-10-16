import type { Verdict } from './contract.ts';

type Fired = Extract<Verdict, { readonly kind: 'fired' }>;
type Clear = Extract<Verdict, { readonly kind: 'clear' }>;
type NotApplicable = Extract<Verdict, { readonly kind: 'not-applicable' }>;

const joined = (texts: readonly string[]): string => [...new Set(texts)].join('; ');

const mergeFired = (fired: readonly [Fired, ...Fired[]]): Fired => {
    const worst = fired.reduce((current, verdict) => (verdict.severity > current.severity ? verdict : current));
    return {
        kind: 'fired',
        severity: worst.severity,
        evidence: {
            spanIds: fired.flatMap((verdict) => verdict.evidence.spanIds),
            summary: joined(fired.map((verdict) => verdict.evidence.summary)),
        },
    };
};

const mergeClear = (clear: readonly [Clear, ...Clear[]]): Clear => ({
    kind: 'clear',
    evidence: { summary: joined(clear.map((verdict) => verdict.evidence.summary)) },
});

const mergeNotApplicable = (notApplicable: readonly [NotApplicable, ...NotApplicable[]]): NotApplicable => ({
    kind: 'not-applicable',
    reason: joined(notApplicable.map((verdict) => verdict.reason)),
});

/**
 * One verdict for a trace with several top-level agent runs (agents run as workflow steps), each judged on its own:
 * fired if any fired, at the highest severity, with every fired run's evidence; else clear if any run could be
 * judged; else not applicable. A single verdict comes back unchanged.
 */
export const worstVerdict = (verdicts: readonly [Verdict, ...Verdict[]]): Verdict => {
    if (verdicts.length === 1) {
        return verdicts[0];
    }
    const [firstFired, ...moreFired] = verdicts.filter((verdict) => verdict.kind === 'fired');
    if (firstFired !== undefined) {
        return mergeFired([firstFired, ...moreFired]);
    }
    const [firstClear, ...moreClear] = verdicts.filter((verdict) => verdict.kind === 'clear');
    if (firstClear !== undefined) {
        return mergeClear([firstClear, ...moreClear]);
    }
    const [first, ...rest] = verdicts.filter((verdict) => verdict.kind === 'not-applicable');
    return first === undefined ? verdicts[0] : mergeNotApplicable([first, ...rest]);
};
