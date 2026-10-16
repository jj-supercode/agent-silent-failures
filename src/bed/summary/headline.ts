import type { EntryId } from '../../entries/index.ts';
import { unitIntervalSchema, type UnitInterval } from '../../trace/index.ts';
import type { ConditionLabel, HeadlineRow, RunCondition, RunQuality, ScoredRun } from '../model.ts';
import { rateWhere } from '../stats/rate.ts';
import { conditionLabel, firedFor, scoredBy } from './run-queries.ts';

/**
 * One row per clean variation, because task outcome depends on the setting (a fault is compared with the clean
 * variation on the same documents); faulted runs pool by fault over all of its severities.
 */
const headlineGroup = (condition: RunCondition): ConditionLabel => {
    switch (condition.kind) {
        case 'clean':
            return conditionLabel(condition);
        case 'faulted':
            return `${condition.faultId} (${condition.entryId})`;
        default:
            return condition satisfies never;
    }
};

const qualityOf = (run: ScoredRun): readonly RunQuality[] =>
    run.observation.kind === 'agent-run' ? [run.observation.quality] : [];

const mean = (values: readonly number[]): UnitInterval | null =>
    values.length === 0
        ? null
        : unitIntervalSchema.parse(values.reduce((sum, value) => sum + value, 0) / values.length);

const headlineRow = (
    condition: ConditionLabel,
    runs: readonly ScoredRun[],
    entryIds: readonly EntryId[],
): HeadlineRow => {
    const qualities = runs.flatMap(qualityOf);
    const judgedAnswers = qualities.flatMap((quality) =>
        quality.goldAnswerFound === null ? [] : [quality.goldAnswerFound],
    );
    return {
        condition,
        agentRuns: qualities.length,
        firedByEntry: entryIds.map((entryId) => ({
            entryId,
            fired: rateWhere(scoredBy(runs, entryId), firedFor(entryId)),
        })),
        goldAnswerFound: rateWhere(judgedAnswers, (found) => found),
        meanGoldSentenceRecall: mean(
            qualities.flatMap((quality) => (quality.goldSentenceRecall === null ? [] : [quality.goldSentenceRecall])),
        ),
    };
};

/** The table that shows a canary firing while task accuracy barely moves. */
export const headlineRows = (runs: readonly ScoredRun[], entryIds: readonly EntryId[]): readonly HeadlineRow[] =>
    [...Map.groupBy(runs, (run) => headlineGroup(run.condition))].map(([key, items]) =>
        headlineRow(key, items, entryIds),
    );
