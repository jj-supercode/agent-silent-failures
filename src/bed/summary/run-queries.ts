import type { EntryId } from '../../entries/index.ts';
import type { ConditionLabel, EntryVerdict, RunCondition, ScoredRun } from '../model.ts';

export const verdictOf = (run: ScoredRun, entryId: EntryId): EntryVerdict | undefined =>
    run.verdicts.find((scored) => scored.entryId === entryId);

export const firedFor =
    (entryId: EntryId) =>
    (run: ScoredRun): boolean =>
        verdictOf(run, entryId)?.verdict.kind === 'fired';

export const isApplicableFor =
    (entryId: EntryId) =>
    (run: ScoredRun): boolean => {
        const kind = verdictOf(run, entryId)?.verdict.kind;
        return kind !== undefined && kind !== 'not-applicable';
    };

/** Runs the entry was scored on at all: agent runs for run entries, ingestions for ingestion entries. */
export const scoredBy = (runs: readonly ScoredRun[], entryId: EntryId): readonly ScoredRun[] =>
    runs.filter((run) => verdictOf(run, entryId) !== undefined);

export const ownFaultRuns = (runs: readonly ScoredRun[], entryId: EntryId): readonly ScoredRun[] =>
    runs.filter((run) => run.condition.kind === 'faulted' && run.condition.entryId === entryId);

/** A faulted run whose fault changed nothing observable: it cannot be missed, so it is left out of catch rates. */
export const isNotExpressed = (run: ScoredRun): boolean =>
    run.condition.kind === 'faulted' && run.condition.expression === 'not-expressed';

export const cleanRuns = (runs: readonly ScoredRun[]): readonly ScoredRun[] =>
    runs.filter((run) => run.condition.kind === 'clean');

/** Entry ids in the order runs first mention them. */
export const entryIdsOf = (runs: readonly ScoredRun[]): readonly EntryId[] => [
    ...new Set(runs.flatMap((run) => run.verdicts.map((scored) => scored.entryId))),
];

export const conditionLabel = (condition: RunCondition): ConditionLabel => {
    switch (condition.kind) {
        case 'clean':
            return `clean: ${condition.variation}`;
        case 'faulted':
            return `${condition.faultId} / ${condition.severity}`;
        default:
            return condition satisfies never;
    }
};

/** Runs grouped by condition, in first-appearance order of conditions and runs. */
export const byCondition = (runs: readonly ScoredRun[]): readonly [ConditionLabel, ScoredRun[]][] => [
    ...Map.groupBy(runs, (run) => conditionLabel(run.condition)),
];
