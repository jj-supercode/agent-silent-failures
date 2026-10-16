import { scoreTraceBatch } from '@mastra/core/evals/scoreTraces';
import type { Mastra } from '@mastra/core/mastra';

import type { Entry } from '../../entries/index.ts';
import type { TraceId } from '../../trace/index.ts';
import type { RegisteredEntryScorer } from '../start-studio-harness.ts';
import type { EntryOutcome } from './model.ts';

type BatchResult = Awaited<ReturnType<typeof scoreTraceBatch>>['results'][number];

const outcomeOf = (entry: Entry, result: BatchResult | undefined): EntryOutcome => {
    if (result === undefined) {
        return { entryId: entry.id, kind: 'scoring-failed', reason: 'trace scoring returned no result' };
    }
    if (!result.ok) {
        return { entryId: entry.id, kind: 'scoring-failed', reason: result.error.message };
    }
    if ('notScorable' in result) {
        return { entryId: entry.id, kind: 'not-scorable', reason: result.notScorable.reason ?? 'not scorable' };
    }
    return {
        entryId: entry.id,
        kind: result.score.score === 1 ? 'fired' : 'clear',
        reason: result.score.reason ?? '',
    };
};

/**
 * Scores one stored trace with each entry's scorer as registered on the Studio instance (registration hands it the
 * instance it loads traces from), through Mastra's own trace
 * scoring: what "Score trace" in Studio runs.
 */
export const scoreTraceWithEntries = async (
    mastra: Mastra,
    traceId: TraceId,
    entryScorers: readonly RegisteredEntryScorer[],
): Promise<readonly EntryOutcome[]> => {
    const storage = mastra.getStorage();
    if (storage === undefined) {
        return entryScorers.map(({ entry }) => ({
            entryId: entry.id,
            kind: 'scoring-failed',
            reason: 'the Studio instance has no storage',
        }));
    }
    return Array.fromAsync(entryScorers, async ({ entry, scorer }) => {
        const batch = await scoreTraceBatch({ storage, scorer, targets: [{ traceId }] });
        return outcomeOf(entry, batch.results[0]);
    });
};
