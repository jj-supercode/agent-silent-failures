import type { Verdict } from './contract.ts';

/** A verdict a scorer reports as a score: a not-applicable verdict is reported as not scorable instead. */
export type ScoredVerdict = Exclude<Verdict, { readonly kind: 'not-applicable' }>;

/** Severity leads a fired reason, since the Mastra score itself stays 0 or 1. */
export const verdictReason = (verdict: ScoredVerdict): string =>
    verdict.kind === 'fired'
        ? `fired, severity ${verdict.severity.toFixed(2)}: ${verdict.evidence.summary}`
        : verdict.evidence.summary;
