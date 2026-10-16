import { conditionKey, type RunSpec } from '../bed/index.ts';
import { variationIdSchema } from '../catalog/index.ts';

/**
 * How many planned runs of each condition a live session records: the bed's held-out clean baselines in full for the
 * single agent (120 runs, which bounds a zero false-alarm rate near 3%), three of five replicates for the costlier supervisor
 * runs, and the first runs of every other clean variation and infrastructure fault. Sized so every run at its own
 * spend cap still fits the default USD 10 cap.
 */
export const liveQuota = {
    singleAgentBaseline: 120,
    multiAgentBaseline: 72,
    otherCondition: 12,
} as const satisfies Record<string, number>;

const singleAgentBaseline = variationIdSchema.parse('baseline');
const multiAgentBaseline = variationIdSchema.parse('multi-agent-baseline');

const quotaFor = (spec: RunSpec): number => {
    if (spec.condition.kind === 'clean' && spec.condition.variation === singleAgentBaseline) {
        return liveQuota.singleAgentBaseline;
    }
    if (spec.condition.kind === 'clean' && spec.condition.variation === multiAgentBaseline) {
        return liveQuota.multiAgentBaseline;
    }
    return liveQuota.otherCondition;
};

/** Why a planned condition is not run live. */
export type LiveExclusion = {
    readonly condition: string;
    readonly reason: 'scripted-only' | 'no-model';
    readonly plannedRuns: number;
};

export type LivePlan = {
    readonly runs: readonly RunSpec[];
    readonly exclusions: readonly LiveExclusion[];
};

const exclusionReason = (spec: RunSpec): LiveExclusion['reason'] | null => {
    if (spec.observation === 'ingestion') {
        return 'no-model';
    }
    return spec.modelSource === 'fault-policy' ? 'scripted-only' : null;
};

const exclusionsOf = (specs: readonly RunSpec[]): readonly LiveExclusion[] =>
    [...Map.groupBy(specs, (spec) => `${spec.observation}:${conditionKey(spec.condition)}`)].flatMap(([, group]) => {
        const [first] = group;
        const reason = first === undefined ? null : exclusionReason(first);
        return first === undefined || reason === null
            ? []
            : [
                  {
                      condition: `${first.observation} ${conditionKey(first.condition)}`,
                      reason,
                      plannedRuns: group.length,
                  },
              ];
    });

const byCondition = (specs: readonly RunSpec[]): readonly (readonly RunSpec[])[] => [
    ...Map.groupBy(specs, (spec) => conditionKey(spec.condition)).values(),
];

const withinQuota = (group: readonly RunSpec[]): readonly RunSpec[] =>
    group.slice(0, group[0] === undefined ? 0 : quotaFor(group[0]));

/** The first run of every condition, then every second, and so on: a cut prefix still covers every condition. */
const roundRobin = (groups: readonly (readonly RunSpec[])[]): readonly RunSpec[] =>
    Array.from({ length: Math.max(0, ...groups.map((group) => group.length)) }, (_, index) =>
        groups.flatMap((group) => group.slice(index, index + 1)),
    ).flat();

/**
 * Selects the runs a live model can take part in: agent runs whose model is the clean policy. A fault that replaces
 * the policy has no live counterpart (it is the scripted reproduction of a model behaviour), and an ingestion calls
 * no model at all, so their numbers stay scripted. Pure: the same plan always selects the same runs. `maxRuns` keeps
 * a prefix of a round robin over conditions, so a short session still samples every condition.
 */
export const selectLiveRuns = (specs: readonly RunSpec[], maxRuns: number | null): LivePlan => {
    const selected = roundRobin(byCondition(specs.filter((spec) => exclusionReason(spec) === null)).map(withinQuota));
    return {
        runs: maxRuns === null ? selected : selected.slice(0, maxRuns),
        exclusions: exclusionsOf(specs),
    };
};
