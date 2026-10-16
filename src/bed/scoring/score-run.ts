import { ingestionEntryItems, runEntryItems } from '../../catalog/index.ts';
import { harnessRetrievalTools, type ObservedIngestion } from '../../harness/index.ts';
import { toRunView, type SpanRecord } from '../../trace/index.ts';
import type { EntryVerdict, Observation, RunLabels, RunSource, ScoredRun } from '../model.ts';
import { scoredCondition } from './fault-expression.ts';
import { runQuality } from './run-quality.ts';
import { scoreAgentRunSpans, scoreIngestionSpans, type SpanScoring } from './score-views.ts';

export type ScoredRunResult =
    { readonly kind: 'scored'; readonly run: ScoredRun } | { readonly kind: 'unscorable'; readonly reason: string };

type Observed =
    | { readonly kind: 'observed'; readonly observation: Observation }
    | Extract<ScoredRunResult, { readonly kind: 'unscorable' }>;

const observationOf = (labels: RunLabels, spans: readonly SpanRecord[]): Observed => {
    switch (labels.observation) {
        case 'ingestion':
            return { kind: 'observed', observation: { kind: 'ingestion' } };
        case 'agent-run': {
            const mapped = toRunView(spans, { retrievalTools: harnessRetrievalTools });
            return mapped.kind === 'run'
                ? {
                      kind: 'observed',
                      observation: { kind: 'agent-run', quality: runQuality(labels.question, mapped.view) },
                  }
                : { kind: 'unscorable', reason: mapped.reason };
        }
        default:
            return labels.observation satisfies never;
    }
};

const verdictsOf = (labels: RunLabels, spans: readonly SpanRecord[]): SpanScoring =>
    labels.observation === 'agent-run'
        ? scoreAgentRunSpans(runEntryItems, spans)
        : scoreIngestionSpans(ingestionEntryItems, spans);

const toScoredRun = (
    labels: RunLabels,
    source: RunSource,
    observation: Observation,
    verdicts: readonly EntryVerdict[],
    observedIngestion: ObservedIngestion | null,
): ScoredRun => ({
    runId: labels.runId,
    source,
    split: labels.split,
    family: labels.family,
    questionId: labels.question.id,
    harness: labels.harness,
    observation,
    condition: scoredCondition(labels.condition, observedIngestion),
    verdicts,
});

/**
 * Scores one finished run's stored spans with every catalog entry in scope: run entries on an agent run,
 * ingestion entries on an ingestion. The bed and replay both build their `ScoredRun`s here. `observedIngestion` is
 * what the run's harness observed of its own ingestion; without it (replay) a fault checked on the ingestion records
 * its expression as `unknown`, because the trace holds only the report a detector reads.
 */
export const scoreRun = (
    labels: RunLabels,
    spans: readonly SpanRecord[],
    source: RunSource,
    observedIngestion: ObservedIngestion | null,
): ScoredRunResult => {
    const observed = observationOf(labels, spans);
    if (observed.kind === 'unscorable') {
        return { kind: 'unscorable', reason: `${labels.runId}: ${observed.reason}` };
    }
    const scoring = verdictsOf(labels, spans);
    return scoring.kind === 'scored'
        ? {
              kind: 'scored',
              run: toScoredRun(labels, source, observed.observation, scoring.verdicts, observedIngestion),
          }
        : { kind: 'unscorable', reason: `${labels.runId}: ${scoring.reason}` };
};
