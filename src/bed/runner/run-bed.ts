import { loadTraceSpans, type TraceId } from '../../trace/index.ts';
import type { RunId, RunSpec, ScoredRun } from '../model.ts';
import { scoreRun } from '../scoring/score-run.ts';
import { openHarnessSession, type HarnessSession } from './harness-session.ts';

export type RunFailure = { readonly runId: RunId; readonly reason: string };

export type BedOutcome = { readonly runs: readonly ScoredRun[]; readonly failures: readonly RunFailure[] };

/** One finished run, as reported to a progress listener the moment it finishes. */
export type SpecOutcome =
    { readonly kind: 'scored'; readonly run: ScoredRun } | { readonly kind: 'failed'; readonly failure: RunFailure };

const failed = (spec: RunSpec, reason: string): SpecOutcome => ({
    kind: 'failed',
    failure: { runId: spec.runId, reason },
});

/** Reads a finished trace (the loader refuses an in-progress one) and scores it. */
const scoreStoredTrace = async (session: HarnessSession, spec: RunSpec, traceId: TraceId): Promise<SpecOutcome> => {
    const loaded = await loadTraceSpans(session.mastra, traceId);
    if (loaded.kind === 'failed') {
        return failed(spec, `trace ${traceId}: ${JSON.stringify(loaded.failure)}`);
    }
    const scored = scoreRun(spec, loaded.spans, 'scripted', session.observedIngestion);
    return scored.kind === 'scored' ? scored : failed(spec, scored.reason);
};

const runSpec = async (session: HarnessSession, spec: RunSpec): Promise<SpecOutcome> => {
    switch (spec.observation) {
        case 'ingestion':
            return scoreStoredTrace(session, spec, session.ingestionTraceId);
        case 'agent-run': {
            const outcome = await session.runAgent(spec);
            return outcome.kind === 'completed'
                ? scoreStoredTrace(session, spec, outcome.run.traceId)
                : failed(spec, outcome.reason);
        }
        default:
            return spec.observation satisfies never;
    }
};

/** One harness per plan; its runs one after another (they share one Mastra instance); disposed before the next. */
const runHarnessGroup = async (
    specs: readonly [RunSpec, ...RunSpec[]],
    onRun: (outcome: SpecOutcome) => void,
): Promise<readonly SpecOutcome[]> => {
    const reported = (outcome: SpecOutcome): SpecOutcome => {
        onRun(outcome);
        return outcome;
    };
    const opening = await openHarnessSession(specs[0].plan);
    if (opening.kind === 'failed') {
        return specs.map((spec) => reported(failed(spec, `harness ${spec.plan.key}: ${opening.reason}`)));
    }
    await using session = opening.session;
    return await Array.fromAsync(specs, async (spec) => reported(await runSpec(session, spec)));
};

/** Specs grouped by the harness they share, in plan order; each group is non-empty. */
export const groupsByHarness = (specs: readonly RunSpec[]): readonly (readonly [RunSpec, ...RunSpec[]])[] =>
    [...Map.groupBy(specs, (spec) => spec.plan.key).values()].flatMap(([first, ...rest]) =>
        first === undefined ? [] : [[first, ...rest] as const],
    );

/**
 * Runs every spec on the offline stack, one harness at a time (about 1 GB per harness cold, 0.5 GB warm), and
 * scores each finished trace. A failed run is reported, never dropped silently or counted as clear.
 */
export const runBed = async (
    specs: readonly RunSpec[],
    onRun: (outcome: SpecOutcome) => void = () => undefined,
): Promise<BedOutcome> => {
    const outcomes = await Array.fromAsync(groupsByHarness(specs), (group) => runHarnessGroup(group, onRun));
    const flat = outcomes.flat();
    return {
        runs: flat.flatMap((outcome) => (outcome.kind === 'scored' ? [outcome.run] : [])),
        failures: flat.flatMap((outcome) => (outcome.kind === 'failed' ? [outcome.failure] : [])),
    };
};
