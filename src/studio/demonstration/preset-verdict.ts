import type { EntryId } from '../../entries/index.ts';
import type { DemonstrationTrace, EntryOutcome, PresetDemonstration } from './model.ts';

/** How one preset's expected entry fared over every trace it produced, with the evidence a reader can check. */
export type PresetVerdict =
    | {
          readonly kind: 'fired';
          readonly fired: number;
          readonly traces: number;
          /** The first firing's reason, as Studio shows it. */
          readonly evidence: string;
      }
    | {
          /** Scored, never fired: the model recovered, or the fault never expressed. Reported, never hidden. */
          readonly kind: 'not-fired';
          readonly traces: number;
          readonly failedRuns: number;
          readonly evidence: string;
      }
    | { readonly kind: 'not-run'; readonly reason: string };

const outcomesOf = (trace: DemonstrationTrace): readonly EntryOutcome[] =>
    trace.kind === 'run-failed' ? [] : trace.outcomes;

const expectedOutcome = (trace: DemonstrationTrace, entryId: EntryId): EntryOutcome | undefined =>
    outcomesOf(trace).find((outcome) => outcome.entryId === entryId);

const failedRunReason = (trace: DemonstrationTrace): string | null =>
    trace.kind === 'run-failed' ? `run failed: ${trace.reason}` : null;

export const presetVerdict = (demonstration: PresetDemonstration): PresetVerdict => {
    if (demonstration.kind === 'not-run') {
        return { kind: 'not-run', reason: demonstration.reason };
    }
    const outcomes = demonstration.traces.map((trace) => expectedOutcome(trace, demonstration.expectedEntry));
    const firings = outcomes.filter((outcome) => outcome?.kind === 'fired');
    const [firstFiring] = firings;
    if (firstFiring !== undefined) {
        return {
            kind: 'fired',
            fired: firings.length,
            traces: demonstration.traces.length,
            evidence: firstFiring.reason,
        };
    }
    const evidence =
        outcomes.find((outcome) => outcome !== undefined)?.reason ??
        demonstration.traces.map(failedRunReason).find((reason) => reason !== null) ??
        'no trace was scored';
    return {
        kind: 'not-fired',
        traces: demonstration.traces.length,
        failedRuns: demonstration.traces.filter((trace) => trace.kind === 'run-failed').length,
        evidence,
    };
};

/** Other entries that fired on this preset's traces: a co-occurring failure, or a false alarm worth reading. */
export const otherFiredEntries = (demonstration: PresetDemonstration): readonly EntryId[] =>
    demonstration.kind === 'not-run'
        ? []
        : [
              ...new Set(
                  demonstration.traces.flatMap((trace) =>
                      outcomesOf(trace)
                          .filter(
                              (outcome) => outcome.kind === 'fired' && outcome.entryId !== demonstration.expectedEntry,
                          )
                          .map((outcome) => outcome.entryId),
                  ),
              ),
          ];
