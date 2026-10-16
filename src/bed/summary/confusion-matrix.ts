import type { EntryId } from '../../entries/index.ts';
import type { ConfusionRow, ScoredRun } from '../model.ts';
import { rateWhere } from '../stats/rate.ts';
import { byCondition, firedFor, scoredBy } from './run-queries.ts';

/**
 * Every detector on every condition, own faults and others alike. A cell counts the runs the entry was scored on
 * (`not-applicable` counts as not fired), so an ingestion entry's cell on a condition comes from its ingestions.
 */
export const confusionMatrix = (runs: readonly ScoredRun[], entryIds: readonly EntryId[]): readonly ConfusionRow[] =>
    byCondition(runs).map(([key, items]) => {
        const condition = items[0]?.condition;
        return {
            condition: key,
            ownEntryId: condition?.kind === 'faulted' ? condition.entryId : null,
            firedByEntry: entryIds.map((entryId) => ({
                entryId,
                fired: rateWhere(scoredBy(items, entryId), firedFor(entryId)),
            })),
        };
    });
