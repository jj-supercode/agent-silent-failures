import type { ThresholdSweep } from '../../catalog/index.ts';
import type { Entry, IngestionEntry, RunEntry, ThresholdOverrides, Verdict } from '../../entries/index.ts';
import { toIngestionView, toRunView, type SpanRecord } from '../../trace/index.ts';
import type { EntryVerdict, SweepPoint } from '../model.ts';

/** An entry with the threshold ranges its sensitivity is measured over. */
export type ScorableEntry<TEntry extends Entry = Entry> = {
    readonly entry: TEntry;
    readonly sweeps: readonly ThresholdSweep[];
};

export type SpanScoring =
    | { readonly kind: 'scored'; readonly verdicts: readonly EntryVerdict[] }
    | { readonly kind: 'unscorable'; readonly reason: string };

const sweepPoints = (
    sweeps: readonly ThresholdSweep[],
    defaults: Entry['thresholds'],
    detect: (overrides: ThresholdOverrides) => Verdict,
): readonly SweepPoint[] =>
    sweeps.flatMap(({ threshold, values }) =>
        values.map((value) => ({
            threshold,
            value,
            isDefault: defaults[threshold]?.value === value,
            outcome: detect({ [threshold]: value }).kind,
        })),
    );

const entryVerdict = (
    { entry, sweeps }: ScorableEntry,
    detect: (overrides: ThresholdOverrides) => Verdict,
): EntryVerdict => ({
    entryId: entry.id,
    verdict: detect({}),
    sweep: sweepPoints(sweeps, entry.thresholds, detect),
});

/** Every run entry on one agent run's spans, each through its own run-view options, with its threshold sweeps. */
export const scoreAgentRunSpans = (
    runEntries: readonly ScorableEntry<RunEntry>[],
    spans: readonly SpanRecord[],
): SpanScoring => {
    const scored = runEntries.map((scorable) => ({
        scorable,
        mapped: toRunView(spans, scorable.entry.runViewOptions),
    }));
    const unmapped = scored.find(({ mapped }) => mapped.kind === 'not-a-run');
    if (unmapped?.mapped.kind === 'not-a-run') {
        return { kind: 'unscorable', reason: `${unmapped.scorable.entry.id}: ${unmapped.mapped.reason}` };
    }
    return {
        kind: 'scored',
        verdicts: scored.flatMap(({ scorable, mapped }) =>
            mapped.kind === 'run'
                ? [entryVerdict(scorable, (overrides) => scorable.entry.detect(mapped.view, overrides))]
                : [],
        ),
    };
};

/** Every ingestion entry on one ingestion trace's spans, with its threshold sweeps. */
export const scoreIngestionSpans = (
    ingestionEntries: readonly ScorableEntry<IngestionEntry>[],
    spans: readonly SpanRecord[],
): SpanScoring => {
    const mapped = toIngestionView(spans);
    return mapped.kind === 'not-an-ingestion'
        ? { kind: 'unscorable', reason: mapped.reason }
        : {
              kind: 'scored',
              verdicts: ingestionEntries.map((scorable) =>
                  entryVerdict(scorable, (overrides) => scorable.entry.detect(mapped.view, overrides)),
              ),
          };
};
