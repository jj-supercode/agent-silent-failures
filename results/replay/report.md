# Replay of `fixtures/live/2026-10-15`

Traces from a real model run, recorded once and scored offline. Live runs keep each variation family's retrieval settings (top K, chunking); the scripted phrasing and answer wording do not apply to a real model. A detector firing on a clean live run is either a false alarm or a real failure of the model: read its evidence.

- Agent model: `claude-haiku-5-5`; recorded 2026-10-15 on darwin 25.6.0 arm64.
- Runs: 408 planned, 408 recorded, 408 scored, 0 failed while recording, 0 unscorable.
- A recording holds agent runs only. Ingestion calls no model, so ingestion entries (embedding-coverage) are measured by the scripted bed alone: see `results/offline/report.md`.
- No recorded run reproduces a fault of `empty-retrieval-answered`, `swallowed-tool-error`, `tool-loop`, `delegation-ping-pong`, `ignored-worker-result`: their faults replace the model's own behaviour, so they are not recorded and their catch rates read 0/0 here. Those catch rates come from the scripted bed; a replay measures their false alarms.

# Detector test bed results

Source: `recorded` (traces recorded from a real model run, scored offline). Platform: darwin 25.6.0 arm64, Node v24.22.0 (recording). Generated: 2026-10-15 (UTC). Versions: agent model claude-haiku-5-5, @mastra/core 1.77.0, @mastra/observability 1.20.0, @mastra/rag 2.6.7, @mastra/libsql 1.26.1, @mastra/fastembed 1.3.3, ai 7.0.140.

Catch rate counts every run of an entry's own faults (a not-applicable verdict is a miss); where a fault changed nothing observable on some runs (not expressed), the rate over the other runs follows. False-alarm rate counts the clean runs a detector judged. Intervals are Wilson 95% score intervals.

## Held-out split: 408 agent runs, 0 ingestions

### Headline (share of scored runs each detector fired on: agent runs for run entries, ingestions for embedding-coverage; recall@k at the family top K)

| condition                                            | agent runs | flat-score | empty-retrieval-answered | swallowed-tool-error | tool-loop | delegation-ping-pong | ignored-worker-result | gold answer found | gold sentence recall@k |
| ---------------------------------------------------- | ---------: | ---------: | -----------------------: | -------------------: | --------: | -------------------: | --------------------: | ----------------: | ---------------------: |
| clean: baseline                                      |        120 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             85.6% |                  95.3% |
| clean: multi-agent-baseline                          |         72 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             85.3% |                 100.0% |
| clean: duplicated-paragraphs                         |         12 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             81.8% |                  95.8% |
| clean: transient-search-error                        |         12 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             81.8% |                 100.0% |
| clean: search-outage                                 |         12 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |              0.0% |                      - |
| clean: multi-agent-transient-search-error            |         12 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             83.3% |                 100.0% |
| clean: multi-agent-search-outage                     |         12 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |              8.3% |                      - |
| clean: empty-retrieval-abstained/filter-key-mismatch |         12 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |              0.0% |                   0.0% |
| clean: empty-retrieval-abstained/min-score-too-high  |         12 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |              0.0% |                   0.0% |
| clean: empty-retrieval-abstained/zero-query-vector   |         12 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |              0.0% |                   0.0% |
| clean: mastra-default-chunking-short-documents       |         12 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             90.0% |                  91.7% |
| clean: clean-chunking-long-documents                 |         12 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             90.0% |                  95.8% |
| default-chunk-size (embedding-coverage)              |         12 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             81.8% |                 100.0% |
| embed-batch-cap (embedding-coverage)                 |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |              0.0% |                   0.0% |
| zero-vectors (embedding-coverage)                    |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             62.5% |                  57.6% |
| vector-side-off (flat-score)                         |         36 |     100.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             55.9% |                  62.5% |

### Per detector

#### flat-score

- caught 36/36 = 100.0% [Wilson 95%: 90.4%, 100.0%]
    - vector-side-off / collapsed-embedder: caught 12/12 = 100.0% [Wilson 95%: 75.8%, 100.0%]
    - vector-side-off / constant-fused-score: caught 12/12 = 100.0% [Wilson 95%: 75.8%, 100.0%]
    - vector-side-off / non-finite-scores: caught 12/12 = 100.0% [Wilson 95%: 75.8%, 100.0%]
- false alarms 0/252 = 0.0% [Wilson 95%: 0.0%, 1.5%; rule of three: 1.2%]
    - baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - multi-agent-baseline: false alarms 0/72 = 0.0% [Wilson 95%: 0.0%, 5.1%; rule of three: 4.2%]
    - hard negative duplicated-paragraphs: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - transient-search-error: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - search-outage: false alarms 0/0 (no runs) (not applicable: 12)
    - multi-agent-transient-search-error: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - multi-agent-search-outage: false alarms 0/0 (no runs) (not applicable: 12)
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/0 (no runs) (not applicable: 12)
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/0 (no runs) (not applicable: 12)
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/0 (no runs) (not applicable: 12)
    - mastra-default-chunking-short-documents: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - clean-chunking-long-documents: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]

#### empty-retrieval-answered

- caught 0/0 (no runs)
- false alarms 0/288 = 0.0% [Wilson 95%: 0.0%, 1.3%; rule of three: 1.0%]
    - baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - multi-agent-baseline: false alarms 0/72 = 0.0% [Wilson 95%: 0.0%, 5.1%; rule of three: 4.2%]
    - duplicated-paragraphs: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - transient-search-error: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - hard negative search-outage: false alarms 0/0 (no runs) (not applicable: 12)
    - multi-agent-transient-search-error: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - multi-agent-search-outage: false alarms 0/0 (no runs) (not applicable: 12)
    - hard negative empty-retrieval-abstained/filter-key-mismatch: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - hard negative empty-retrieval-abstained/min-score-too-high: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - hard negative empty-retrieval-abstained/zero-query-vector: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - mastra-default-chunking-short-documents: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - clean-chunking-long-documents: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]

#### swallowed-tool-error

- caught 0/0 (no runs)
- false alarms 0/312 = 0.0% [Wilson 95%: 0.0%, 1.2%; rule of three: 1.0%]
    - baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - multi-agent-baseline: false alarms 0/72 = 0.0% [Wilson 95%: 0.0%, 5.1%; rule of three: 4.2%]
    - duplicated-paragraphs: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - hard negative transient-search-error: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - hard negative search-outage: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - hard negative multi-agent-transient-search-error: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - hard negative multi-agent-search-outage: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - mastra-default-chunking-short-documents: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - clean-chunking-long-documents: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]

#### tool-loop

- caught 0/0 (no runs)
- false alarms 0/312 = 0.0% [Wilson 95%: 0.0%, 1.2%; rule of three: 1.0%]
    - baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - hard negative multi-agent-baseline: false alarms 0/72 = 0.0% [Wilson 95%: 0.0%, 5.1%; rule of three: 4.2%]
    - duplicated-paragraphs: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - hard negative transient-search-error: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - search-outage: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - hard negative multi-agent-transient-search-error: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - multi-agent-search-outage: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - mastra-default-chunking-short-documents: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - clean-chunking-long-documents: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]

#### delegation-ping-pong

- caught 0/0 (no runs)
- false alarms 0/96 = 0.0% [Wilson 95%: 0.0%, 3.8%; rule of three: 3.1%]
    - baseline: false alarms 0/0 (no runs) (not applicable: 120)
    - hard negative multi-agent-baseline: false alarms 0/72 = 0.0% [Wilson 95%: 0.0%, 5.1%; rule of three: 4.2%]
    - duplicated-paragraphs: false alarms 0/0 (no runs) (not applicable: 12)
    - transient-search-error: false alarms 0/0 (no runs) (not applicable: 12)
    - search-outage: false alarms 0/0 (no runs) (not applicable: 12)
    - hard negative multi-agent-transient-search-error: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - hard negative multi-agent-search-outage: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/0 (no runs) (not applicable: 12)
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/0 (no runs) (not applicable: 12)
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/0 (no runs) (not applicable: 12)
    - mastra-default-chunking-short-documents: false alarms 0/0 (no runs) (not applicable: 12)
    - clean-chunking-long-documents: false alarms 0/0 (no runs) (not applicable: 12)

#### ignored-worker-result

- caught 0/0 (no runs)
- false alarms 0/87 = 0.0% [Wilson 95%: 0.0%, 4.2%; rule of three: 3.4%]
    - baseline: false alarms 0/0 (no runs) (not applicable: 120)
    - hard negative multi-agent-baseline: false alarms 0/72 = 0.0% [Wilson 95%: 0.0%, 5.1%; rule of three: 4.2%]
    - duplicated-paragraphs: false alarms 0/0 (no runs) (not applicable: 12)
    - transient-search-error: false alarms 0/0 (no runs) (not applicable: 12)
    - search-outage: false alarms 0/0 (no runs) (not applicable: 12)
    - multi-agent-transient-search-error: false alarms 0/12 = 0.0% [Wilson 95%: 0.0%, 24.2%]
    - hard negative multi-agent-search-outage: false alarms 0/3 = 0.0% [Wilson 95%: 0.0%, 56.1%] (not applicable: 9)
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/0 (no runs) (not applicable: 12)
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/0 (no runs) (not applicable: 12)
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/0 (no runs) (not applicable: 12)
    - mastra-default-chunking-short-documents: false alarms 0/0 (no runs) (not applicable: 12)
    - clean-chunking-long-documents: false alarms 0/0 (no runs) (not applicable: 12)

### Cross-fault matrix (fired / scored runs; own fault in bold)

| condition                                            | flat-score | empty-retrieval-answered | swallowed-tool-error | tool-loop | delegation-ping-pong | ignored-worker-result |
| ---------------------------------------------------- | ---------: | -----------------------: | -------------------: | --------: | -------------------: | --------------------: |
| clean: baseline                                      |      0/120 |                    0/120 |                0/120 |     0/120 |                0/120 |                 0/120 |
| clean: multi-agent-baseline                          |       0/72 |                     0/72 |                 0/72 |      0/72 |                 0/72 |                  0/72 |
| clean: duplicated-paragraphs                         |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| clean: transient-search-error                        |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| clean: search-outage                                 |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| clean: multi-agent-transient-search-error            |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| clean: multi-agent-search-outage                     |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| clean: empty-retrieval-abstained/filter-key-mismatch |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| clean: empty-retrieval-abstained/min-score-too-high  |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| clean: empty-retrieval-abstained/zero-query-vector   |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| clean: mastra-default-chunking-short-documents       |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| clean: clean-chunking-long-documents                 |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| default-chunk-size / mastra-defaults                 |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| embed-batch-cap / keeps-7-of-8                       |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| embed-batch-cap / keeps-4-of-8                       |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| zero-vectors / every-tenth                           |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| zero-vectors / every-second                          |       0/12 |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| vector-side-off / collapsed-embedder                 |  **12/12** |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| vector-side-off / constant-fused-score               |  **12/12** |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |
| vector-side-off / non-finite-scores                  |  **12/12** |                     0/12 |                 0/12 |      0/12 |                 0/12 |                  0/12 |

### Threshold sensitivity (one threshold at a time, the others at their defaults)

| entry                    | threshold              |              value | caught (expressed runs) | false alarms (judged clean runs) |
| ------------------------ | ---------------------- | -----------------: | ----------------------- | -------------------------------- |
| flat-score               | MIN_HITS               |                  1 | 36/36 100.0%            | 0/252 0.0%                       |
| flat-score               | MIN_HITS               |                  2 | 36/36 100.0%            | 0/252 0.0%                       |
| flat-score               | MIN_HITS               |        3 (default) | 36/36 100.0%            | 0/252 0.0%                       |
| flat-score               | MIN_HITS               |                  4 | 24/36 66.7%             | 0/168 0.0%                       |
| flat-score               | MIN_HITS               |                  5 | 24/36 66.7%             | 0/168 0.0%                       |
| flat-score               | MIN_HITS               |                  6 | 12/36 33.3%             | 0/84 0.0%                        |
| flat-score               | MAX_FLAT_SPREAD        |               1e-9 | 36/36 100.0%            | 0/252 0.0%                       |
| flat-score               | MAX_FLAT_SPREAD        | 0.000001 (default) | 36/36 100.0%            | 0/252 0.0%                       |
| flat-score               | MAX_FLAT_SPREAD        |             0.0001 | 36/36 100.0%            | 0/252 0.0%                       |
| flat-score               | MAX_FLAT_SPREAD        |               0.01 | 36/36 100.0%            | 1/252 0.4%                       |
| flat-score               | MAX_FLAT_SPREAD        |               0.02 | 36/36 100.0%            | 7/252 2.8%                       |
| flat-score               | MAX_FLAT_SPREAD        |               0.05 | 36/36 100.0%            | 24/252 9.5%                      |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |        0 (default) | - -                     | 0/288 0.0%                       |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |                  1 | - -                     | 0/288 0.0%                       |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |                  3 | - -                     | 69/288 24.0%                     |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |                  5 | - -                     | 134/288 46.5%                    |
| tool-loop                | MIN_REPEATS            |                  2 | - -                     | 0/312 0.0%                       |
| tool-loop                | MIN_REPEATS            |        3 (default) | - -                     | 0/312 0.0%                       |
| tool-loop                | MIN_REPEATS            |                  4 | - -                     | 0/312 0.0%                       |
| tool-loop                | MIN_REPEATS            |                  5 | - -                     | 0/312 0.0%                       |
| tool-loop                | MIN_REPEATS            |                  6 | - -                     | 0/312 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.5 | - -                     | 0/312 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.6 | - -                     | 0/312 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.7 | - -                     | 0/312 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |      0.8 (default) | - -                     | 0/312 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.9 | - -                     | 0/312 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                  1 | - -                     | 0/312 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  1 | - -                     | 0/312 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  2 | - -                     | 0/312 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |        3 (default) | - -                     | 0/312 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  5 | - -                     | 0/312 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  8 | - -                     | 0/312 0.0%                       |
| tool-loop                | MIN_CYCLES             |                  1 | - -                     | 257/312 82.4%                    |
| tool-loop                | MIN_CYCLES             |        2 (default) | - -                     | 0/312 0.0%                       |
| tool-loop                | MIN_CYCLES             |                  3 | - -                     | 0/312 0.0%                       |
| tool-loop                | MAX_RETRIES            |                  0 | - -                     | 9/312 2.9%                       |
| tool-loop                | MAX_RETRIES            |                  1 | - -                     | 0/312 0.0%                       |
| tool-loop                | MAX_RETRIES            |        2 (default) | - -                     | 0/312 0.0%                       |
| tool-loop                | MAX_RETRIES            |                  3 | - -                     | 0/312 0.0%                       |
| tool-loop                | MAX_RETRIES            |                  5 | - -                     | 0/312 0.0%                       |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  2 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | MIN_REDELEGATIONS      |        3 (default) | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  4 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  5 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  7 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.5 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.6 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.7 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |      0.8 (default) | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.9 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                  1 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                0.5 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                0.7 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                0.8 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |      0.9 (default) | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                  1 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |                  3 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |        4 (default) | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |                  5 | - -                     | 0/96 0.0%                        |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |                  6 | - -                     | 0/96 0.0%                        |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |        0 (default) | - -                     | 0/87 0.0%                        |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |                0.1 | - -                     | 0/87 0.0%                        |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |               0.25 | - -                     | 1/87 1.1%                        |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |                0.5 | - -                     | 1/87 1.1%                        |
