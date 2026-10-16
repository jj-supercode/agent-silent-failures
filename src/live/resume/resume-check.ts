import type { RunId, RunSpec } from '../../bed/index.ts';
import type { FixtureManifest } from '../../record/index.ts';

/** What must be equal between a recording and the session resuming it, or the runs would not belong together. */
export type RecordingIdentity = Pick<FixtureManifest, 'mode' | 'corpusSha256' | 'models' | 'versions' | 'split'>;

const versionMismatches = (
    recorded: RecordingIdentity['versions'],
    current: RecordingIdentity['versions'],
): readonly string[] =>
    [...new Set([...Object.keys(recorded), ...Object.keys(current)])]
        .toSorted()
        .flatMap((name) =>
            recorded[name] === current[name]
                ? []
                : [`${name} ${recorded[name] ?? 'absent'} when recorded, ${current[name] ?? 'absent'} now`],
        );

/** Every difference that makes a resume unsound; empty when the session may append to the recording. */
export const identityMismatches = (recorded: RecordingIdentity, current: RecordingIdentity): readonly string[] => [
    ...(recorded.mode === current.mode ? [] : [`mode ${recorded.mode} when recorded, ${current.mode} now`]),
    ...(recorded.corpusSha256 === current.corpusSha256
        ? []
        : [`corpus sha256 ${recorded.corpusSha256} when recorded, ${current.corpusSha256} now`]),
    ...(recorded.models.agent === current.models.agent
        ? []
        : [`agent model ${recorded.models.agent} when recorded, ${current.models.agent} now`]),
    ...(recorded.models.judge === current.models.judge
        ? []
        : [`judge model ${recorded.models.judge ?? 'none'} when recorded, ${current.models.judge ?? 'none'} now`]),
    ...(recorded.split === current.split ? [] : [`split ${recorded.split} when recorded, ${current.split} now`]),
    ...versionMismatches(recorded.versions, current.versions),
];

export type ResumeSelection =
    | { readonly kind: 'runs'; readonly runs: readonly RunSpec[] }
    | { readonly kind: 'foreign-runs'; readonly runIds: readonly RunId[] };

/**
 * The planned runs still to record: every run without a completed line. A completed run the plan does not hold means
 * the plan changed since the recording, so nothing is resumed.
 */
export const runsToResume = (planned: readonly RunSpec[], completed: readonly RunId[]): ResumeSelection => {
    const plannedIds = new Set<RunId>(planned.map((spec) => spec.runId));
    const foreign = completed.filter((runId) => !plannedIds.has(runId));
    if (foreign.length > 0) {
        return { kind: 'foreign-runs', runIds: foreign };
    }
    const done = new Set(completed);
    return { kind: 'runs', runs: planned.filter((spec) => !done.has(spec.runId)) };
};
