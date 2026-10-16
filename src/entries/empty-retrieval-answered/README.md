---
id: empty-retrieval-answered
title: Empty retrieval, answered anyway
family: rag
scope: run
status: stable
requires:
    - tool_call.entityId
    - tool_call.output (retrieved rows)
    - agent_run.output.text
thresholds:
    - name: MAX_HITS_FOR_EMPTY
      value: 0
      basis: an empty row list is the failure itself; any returned row gives the agent something to ground on
      calibratedOn: invariant
references:
    - title: 'CorruptChain: trace how a silent tool failure taints a whole agent run'
      url: https://github.com/royhasenfratz/CorruptChain
      date: 2025-12-31
    - title: 'Sufficient Context: a new lens on retrieval augmented generation systems (arXiv 2411.06037)'
      url: https://arxiv.org/abs/2411.06037
      date: 2024-11-09
    - title: 'collection.query() fails to retrieve documents even when metadata filter matches (Chroma #5367)'
      url: https://github.com/chroma-core/chroma/issues/5367
      date: 2025-08-27
    - title: 'Chaining supervisor agent with agents which own vector tools does not work (Mastra #9699)'
      url: https://github.com/mastra-ai/mastra/issues/9699
      date: 2025-11-04
---

# Empty retrieval, answered anyway

## Symptom

Every retrieval in the run comes back with no rows, and the agent answers confidently anyway, from model memory or
by inventing it, sometimes with a citation label that no returned row carries.

## Why no error is raised

An empty result set is a valid response. A metadata filter on a key the store does not hold, a minimum score tuned
for another embedder's scale, a zero query vector, or an empty namespace all return `[]` with success. Mastra's own
`createVectorQueryTool` goes further: when its store query throws (a missing index, for one), it logs the error and
returns `{ relevantContext: [], sources: [] }`, so the `tool_call` span shows a successful, empty retrieval. The
error survives only on the nested `rag_vector_operation` span and in one log line (`@mastra/rag` 2.6.7 and
`@mastra/libsql` 1.26.1; `pnpm repros vector-query-tool-swallows-store-errors`, and
[Findings in Mastra](../../../docs/findings-in-mastra.md)).

## Trace signature

Every `tool_call` span of a declared retrieval tool that returned a row list returned zero rows, and the root
`agent_run` output text is non-empty and does not abstain.

## Detector

- `not-applicable` when the run made no retrieval call, or when no retrieval call returned a row list (only thrown
  calls or error payloads: that is a tool error, not an empty retrieval).
- `clear` when any retrieval returned more than `MAX_HITS_FOR_EMPTY` rows (search, then refine, is fine), when the
  answer is empty, or when the answer abstains.
- `fired` otherwise, with severity 1: the whole answer is ungrounded. Evidence names the empty retrievals and the
  root agent run.

Abstention is matched with the package's shared phrase set (`could not find`, `no relevant information`, `the
documents do not mention`, `I don't know`, and similar). Add an agent's own declining sentence, and declare its
retrieval tool, when building the scorer:

```ts
import { createEmptyRetrievalAnsweredScorer } from 'agent-silent-failures';
import { decodeVectorQuerySources, toolNameSchema } from 'agent-silent-failures/trace';

const emptyRetrievalAnswered = createEmptyRetrievalAnsweredScorer({
    runViewOptions: { retrievalTools: new Map([[toolNameSchema.parse('vectorQuery'), decodeVectorQuerySources]]) },
    extraAbstentionPatterns: [{ name: 'nothing-on-file', pattern: /nothing on file/ }],
});
```

Patterns run on lower-cased text.

## Thresholds and why

`MAX_HITS_FOR_EMPTY = 0` (invariant). An empty row list is the failure itself. The threshold exists for
sensitivity sweeps: raising it treats a thin retrieval of one row as empty.

## Reproduction

The failure needs two parts, so the fault `empty-retrieval-answered-from-memory` sets both: a retrieval mechanism
that silently returns zero rows, and a scripted model that answers from memory after an empty search (the behaviour
"Sufficient Context" reports for models that do not abstain).

| Severity              | Mechanism that empties retrieval                                                             |
| --------------------- | -------------------------------------------------------------------------------------------- |
| `filter-key-mismatch` | the tool filters on `doc_id`, a key no stored row has; LibSQL returns `[]`                   |
| `min-score-too-high`  | a 0.99 minimum score, tuned for another embedder; no bge-small row of this corpus reaches it |
| `zero-query-vector`   | the query embedding comes back as zeros; LibSQL ranks nothing against it and returns `[]`    |

Hard negative `empty-retrieval-abstained`: the same three mechanisms with the clean policy, which abstains in
its family's wording (held-out families use abstention sentences no dev family uses). Every one of these runs must stay clear.

## Known false alarms

- Abstentions phrased outside the shared phrase set (live models) read as answers. Add the agent's phrasing with
  `extraAbstentionPatterns`.
- A question the model can answer correctly from memory still fires. That answer is ungrounded, which is what the
  entry reports, but it may be right.

## Known misses

- Retrieval that returns rows that are irrelevant (wrong namespace with data in it) is not empty and is not caught.
- A retrieval tool that is not declared in `retrievalTools` is invisible to the detector.
- An abstention phrase followed by an answer ("I could not find it, but it is X") reads as an abstention.

## Credits

CorruptChain (royhasenfratz, 2025) is prior art for flagging answers built on empty or degraded tool steps, with a
deterministic taint analysis over Python agent traces. This entry is the per-run Mastra scorer with a reproducible
fault and measured rates.

## Results

<!-- docs-tables:results:start -->

Source: `scripted` (offline scripted model, local embeddings). Platform: darwin arm64, Node v24.22.0. Generated: 2026-10-15 (UTC). Versions: @mastra/core 1.77.0, @mastra/rag 2.6.7, @mastra/fastembed 1.3.3, @mastra/libsql 1.26.1.

- caught 72/72 = 100.0% [Wilson 95%: 94.9%, 100.0%]
    - empty-retrieval-answered-from-memory / filter-key-mismatch: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - empty-retrieval-answered-from-memory / min-score-too-high: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - empty-retrieval-answered-from-memory / zero-query-vector: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/480 = 0.0% [Wilson 95%: 0.0%, 0.8%; rule of three: 0.6%]
    - hard negative search-outage: false alarms 0/0 (no runs)
    - hard negative empty-retrieval-abstained/filter-key-mismatch: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative empty-retrieval-abstained/min-score-too-high: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative empty-retrieval-abstained/zero-query-vector: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
- Fires on no other entry's fault.
- Threshold sensitivity (one threshold at a time, the others at their defaults; caught over expressed runs):
    - `MAX_HITS_FOR_EMPTY`: 0 (default): caught 72/72, false alarms 0/480; 1: caught 72/72, false alarms 0/480; 3: caught 72/72, false alarms 136/480; 5: caught 72/72, false alarms 272/480

Held-out families vary retrieval config, query phrasing, answer and abstention wording, and supervisor and worker wording, and the clean pool holds hard negatives; the faults themselves are our reproductions, so a high catch rate shows the detector matches them, not how often the failure occurs or is caught in the wild. Generated by `pnpm docs:tables` from `results/offline/report.json`.

<!-- docs-tables:results:end -->
