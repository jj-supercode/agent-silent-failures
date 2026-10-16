---
id: flat-score
title: Flat retrieval scores
family: rag
scope: run
status: stable
requires:
    - tool_call.entityId
    - tool_call.output (retrieved rows with a score per row)
thresholds:
    - name: MIN_HITS
      value: 3
      basis: two rows can tie legitimately (a duplicated chunk); three equal scores from distinct embeddings cannot
      calibratedOn: prior
    - name: MAX_FLAT_SPREAD
      value: 1e-6
      basis: float32 noise level of stored vectors; a working dense retrieval spreads its top rows far wider
      calibratedOn: prior
references:
    - title: 'ChromaVectorStore returns only similarity score 0.0 for all retrieved documents (LlamaIndex #19910)'
      url: https://github.com/run-llama/llama_index/issues/19910
      date: 2025-09-19
    - title: 'gRPC ingestion accepts NaN vectors; NaN scores rank above finite (Qdrant #9201)'
      url: https://github.com/qdrant/qdrant/issues/9201
      date: 2026-05-27
    - title: 'The Magnitude Mirage: score-distribution signals for retrieval abstention (arXiv 2609.15578)'
      url: https://arxiv.org/abs/2609.15578
      date: 2026-09-14
---

# Flat retrieval scores

## Symptom

Retrieval returns rows, but every row has the same score, or the scores are not numbers. The ranking is noise:
the agent gets whichever rows the store happened to list first. Answers can still look fine on a small corpus or
when the model already knows the answer, so nobody notices until quality drops on harder questions.

## Why no error is raised

The store or fusion layer returns a well-formed list. A collapsed embedder (every text maps to the same vector), a
hybrid fusion whose dense leg contributes nothing, or NaN vectors accepted at ingestion all produce constant or
non-finite scores without throwing. The tool call succeeds and the rows look like any other rows.

## Trace signature

A `tool_call` span of a declared retrieval tool whose output rows carry scores with a max-minus-min spread of
(almost) zero, or at least one NaN or infinite score (stored as `null`, since JSON has no NaN).

## Detector

For each retrieval call that returned at least `MIN_HITS` rows: the call is flat when any score is non-finite, or
when the score spread is at most `MAX_FLAT_SPREAD`. The run fires when any call is flat; severity is flat calls
over judged calls. A run with no call of at least `MIN_HITS` rows is `not-applicable` (never clear): there was no
ranking to judge. Rows cut off by the span serializer's 50-item array cap are reported in the evidence.

The detector reads retrieval calls through `runViewOptions.retrievalTools`, a map from tool name to a decoder of
that tool's output. Two decoders ship with the package:

```ts
import { createFlatScoreScorer } from 'agent-silent-failures';
import { decodeHitList, decodeVectorQuerySources, toolNameSchema } from 'agent-silent-failures/trace';

// An agent that retrieves with @mastra/rag's createVectorQueryTool({ id: 'vectorQuery', ... }):
const flatScore = createFlatScoreScorer({
    retrievalTools: new Map([[toolNameSchema.parse('vectorQuery'), decodeVectorQuerySources]]),
});
// A custom tool returning { hits: [{ chunkId, sourceId, score, text }] } uses decodeHitList instead.
```

Register the scorer on the Mastra instance that stores the traces, then score traces from Studio or with
`scoreTraces`.

## Thresholds and why

- `MIN_HITS = 3` (prior). Two rows can tie legitimately, for example a chunk ingested twice. Three rows with
  distinct embeddings tying to within float noise is a coincidence a detector may ignore.
- `MAX_FLAT_SPREAD = 1e-6` (prior). Float32 noise level for stored vectors. Every faulted run has a spread of
  exactly 0 or a NaN score by construction. How far clean spreads sit above the threshold is in the threshold
  sensitivity line under Results: the narrowest held-out clean spread lies between the largest swept value with no
  clean run firing and the first value with one.

## Reproduction

Fault `vector-side-off`, through harness mechanisms only (the trace is never edited):

| Severity               | Mechanism                                                                     |
| ---------------------- | ----------------------------------------------------------------------------- |
| `collapsed-embedder`   | every document and query embeds to the same unit vector, so every cosine is 1 |
| `constant-fused-score` | a fusion layer whose dense leg is dead reports 0.5 for every row              |
| `non-finite-scores`    | the store scores every row NaN                                                |

Hard negative in the clean pool: every paragraph ingested twice under two source ids, so the top rows come in
tied pairs. The spread across at least three rows stays well above the threshold and the detector stays clear.

## Known false alarms

- A retrieval tool whose scores are binary by design (exact keyword match) ties every row. Declare only tools with
  graded scores in `retrievalTools`.
- Three or more identical chunks (repeated boilerplate such as a footer) tie exactly when they are the top rows.

## Known misses

- A rank-only ladder (scores exactly `1 / (c + rank)`, reciprocal rank fusion with one dead leg) has a spread and is
  not caught.
- A tool that drops scores from its output (for example `createVectorQueryTool` with `includeSources: false`) is
  `not-applicable`: there is nothing to judge.
- `createVectorQueryTool` maps a missing score to 0 (`score || 0`), so a NaN from the store reaches the trace as 0;
  it is caught only when every row shows it.

## Credits

The score-spread signal is a known query-performance-prediction feature: "The Magnitude Mirage" (arXiv 2609.15578)
shows score-distribution signals such as the score gap beat raw magnitude thresholds for retrieval abstention. This
entry claims only the calibrated detector, the fault and the measured rates, not the signal.

## Results

<!-- docs-tables:results:start -->

Source: `scripted` (offline scripted model, local embeddings). Platform: darwin arm64, Node v24.22.0. Generated: 2026-10-15 (UTC). Versions: @mastra/core 1.77.0, @mastra/rag 2.6.7, @mastra/fastembed 1.3.3, @mastra/libsql 1.26.1.

- caught 72/72 = 100.0% [Wilson 95%: 94.9%, 100.0%]
    - vector-side-off / collapsed-embedder: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - vector-side-off / constant-fused-score: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - vector-side-off / non-finite-scores: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/408 = 0.0% [Wilson 95%: 0.0%, 0.9%; rule of three: 0.7%]
    - hard negative duplicated-paragraphs: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
- Fires on no other entry's fault.
- Threshold sensitivity (one threshold at a time, the others at their defaults; caught over expressed runs):
    - `MIN_HITS`: 1: caught 72/72, false alarms 0/408; 2: caught 72/72, false alarms 0/408; 3 (default): caught 72/72, false alarms 0/408; 4: caught 48/72, false alarms 0/272; 5: caught 48/72, false alarms 0/272; 6: caught 24/72, false alarms 0/136
    - `MAX_FLAT_SPREAD`: 1e-9: caught 72/72, false alarms 0/408; 0.000001 (default): caught 72/72, false alarms 0/408; 0.0001: caught 72/72, false alarms 0/408; 0.01: caught 72/72, false alarms 5/408; 0.02: caught 72/72, false alarms 20/408; 0.05: caught 72/72, false alarms 79/408

Held-out families vary retrieval config, query phrasing, answer and abstention wording, and supervisor and worker wording, and the clean pool holds hard negatives; the faults themselves are our reproductions, so a high catch rate shows the detector matches them, not how often the failure occurs or is caught in the wild. Generated by `pnpm docs:tables` from `results/offline/report.json`.

<!-- docs-tables:results:end -->
