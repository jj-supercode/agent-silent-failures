export type Evidence = Readonly<Record<string, unknown>>;

/** `reproduces`: the recorded behaviour is still present. `not-reproduced`: it is gone, likely changed upstream. */
export type ReproductionOutcome =
    | { readonly kind: 'reproduces'; readonly summary: string; readonly evidence: Evidence }
    | { readonly kind: 'not-reproduced'; readonly summary: string; readonly evidence: Evidence };

/** Acceptance contract of `pnpm repros`: 0 while the behaviour reproduces, 10 once it is gone, anything else is a broken repro. */
export const reproductionExitCodes = {
    reproduces: 0,
    notReproduced: 10,
} as const;

export const outcomeWhen = (behaviourObserved: boolean, summary: string, evidence: Evidence): ReproductionOutcome =>
    behaviourObserved
        ? { kind: 'reproduces', summary, evidence }
        : { kind: 'not-reproduced', summary: `NOT REPRODUCED: ${summary}`, evidence };

export const exitCodeFor = (outcome: ReproductionOutcome): number => {
    switch (outcome.kind) {
        case 'reproduces':
            return reproductionExitCodes.reproduces;
        case 'not-reproduced':
            return reproductionExitCodes.notReproduced;
        default:
            return outcome satisfies never;
    }
};
