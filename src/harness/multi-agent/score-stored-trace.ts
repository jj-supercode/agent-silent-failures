import { scoreTraceBatch } from '@mastra/core/evals/scoreTraces';

import { SmokeRunError } from './errors.ts';
import type { ViewedRun } from './run-views.ts';

type TraceScorer = Parameters<typeof scoreTraceBatch>[0]['scorer'];

/**
 * Scores one stored run through Mastra's own trace scoring path, the one Studio uses. `null` when the scorer
 * returned no score (for example `notScorable`).
 */
export const scoreStoredTrace = async ({ mastra, traceId }: ViewedRun, scorer: TraceScorer): Promise<number | null> => {
    const storage = mastra.getStorage();
    if (storage === undefined) {
        throw new SmokeRunError('the harness Mastra instance has no storage');
    }
    const batch = await scoreTraceBatch({ storage, scorer, targets: [{ traceId }] });
    const [result] = batch.results;
    return result !== undefined && 'score' in result ? result.score.score : null;
};
