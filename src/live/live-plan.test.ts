import { beforeAll, describe, expect, test } from 'vitest';

import { conditionKey, planRuns, type RunSpec } from '../bed/index.ts';
import { loadQuestions } from '../corpus/index.ts';
import { estimateWorstCase } from './budget/preflight.ts';
import { defaultMaxUsd } from './live-options.ts';
import { liveQuota, selectLiveRuns } from './live-plan.ts';
import { plannedSpend } from './planned-spend.ts';

let heldOut: readonly RunSpec[] = [];

beforeAll(async () => {
    const loaded = await loadQuestions();
    if (loaded.kind === 'failed') {
        throw new Error('the corpus did not load');
    }
    heldOut = planRuns(loaded.questions, { split: 'held-out', entryId: null });
});

const countsByCondition = (runs: readonly RunSpec[]): ReadonlyMap<string, number> =>
    new Map([...Map.groupBy(runs, (spec) => conditionKey(spec.condition))].map(([key, group]) => [key, group.length]));

describe('selectLiveRuns', () => {
    test('keeps only agent runs whose model is the clean policy', () => {
        const { runs } = selectLiveRuns(heldOut, null);
        expect(runs.length).toBeGreaterThan(0);
        expect(runs.every((spec) => spec.observation === 'agent-run' && spec.modelSource === 'clean-policy')).toBe(
            true,
        );
    });

    test('names every excluded condition with its reason', () => {
        const { exclusions } = selectLiveRuns(heldOut, null);
        expect(exclusions.some((exclusion) => exclusion.reason === 'scripted-only')).toBe(true);
        expect(exclusions.some((exclusion) => exclusion.reason === 'no-model')).toBe(true);
        expect(exclusions.every((exclusion) => exclusion.plannedRuns > 0)).toBe(true);
    });

    test('takes each condition up to its quota', () => {
        const counts = countsByCondition(selectLiveRuns(heldOut, null).runs);
        expect(counts.get('clean/baseline')).toBe(liveQuota.singleAgentBaseline);
        expect(counts.get('clean/multi-agent-baseline')).toBe(liveQuota.multiAgentBaseline);
        expect([...counts.values()].every((count) => count <= liveQuota.singleAgentBaseline)).toBe(true);
    });

    test('a run limit keeps a prefix that still samples every condition', () => {
        const all = countsByCondition(selectLiveRuns(heldOut, null).runs);
        const short = selectLiveRuns(heldOut, all.size).runs;
        expect(countsByCondition(short).size).toBe(all.size);
    });

    test('is pure: the same plan selects the same runs', () => {
        expect(selectLiveRuns(heldOut, null).runs.map((spec) => spec.runId)).toEqual(
            selectLiveRuns(heldOut, null).runs.map((spec) => spec.runId),
        );
    });

    test('the default plan fits the default cap even if every run spends its own cap, judge excluded', () => {
        const { runs } = selectLiveRuns(heldOut, null);
        expect(estimateWorstCase(plannedSpend(runs, false)).worstCase).toBeLessThanOrEqual(defaultMaxUsd);
    });
});
