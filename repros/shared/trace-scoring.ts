import type { MastraScorer } from '@mastra/core/evals';
import { scoreTraceBatch } from '@mastra/core/evals/scoreTraces';
import type { MastraStorage } from '@mastra/core/storage';

export type TraceScoringResult =
    | { readonly kind: 'scored'; readonly score: number; readonly preprocessStepResult: unknown }
    | { readonly kind: 'not-scorable' }
    | { readonly kind: 'failed'; readonly message: string };

/** Scores one stored trace through the same per-target path Studio's trace scoring uses (`scoreTrace`). */
export const scoreStoredTrace = async (
    storage: MastraStorage,
    scorer: MastraScorer,
    traceId: string,
): Promise<TraceScoringResult> => {
    const { results } = await scoreTraceBatch({ storage, scorer, targets: [{ traceId }] });
    const [result] = results;
    if (result === undefined) {
        return { kind: 'failed', message: 'scoreTraceBatch returned no result' };
    }
    if (!result.ok) {
        return { kind: 'failed', message: result.error.message };
    }
    if ('notScorable' in result) {
        return { kind: 'not-scorable' };
    }
    return { kind: 'scored', score: result.score.score, preprocessStepResult: result.score.preprocessStepResult };
};
