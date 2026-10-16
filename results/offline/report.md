# Detector test bed results

Source: `scripted` (offline scripted model, local embeddings). Platform: darwin arm64, Node v24.22.0. Generated: 2026-10-15 (UTC). Versions: @mastra/core 1.77.0, @mastra/rag 2.6.7, @mastra/fastembed 1.3.3, @mastra/libsql 1.26.1.

Catch rate counts every run of an entry's own faults (a not-applicable verdict is a miss); where a fault changed nothing observable on some runs (not expressed), the rate over the other runs follows. False-alarm rate counts the clean runs a detector judged. Intervals are Wilson 95% score intervals.

## Dev split: 720 agent runs, 512 ingestions

### Headline (share of scored runs each detector fired on: agent runs for run entries, ingestions for embedding-coverage; recall@k at the family top K)

| condition                                                       | agent runs | flat-score | empty-retrieval-answered | swallowed-tool-error | tool-loop | delegation-ping-pong | ignored-worker-result | embedding-coverage | gold answer found | gold sentence recall@k |
| --------------------------------------------------------------- | ---------: | ---------: | -----------------------: | -------------------: | --------: | -------------------: | --------------------: | -----------------: | ----------------: | ---------------------: |
| clean: baseline                                                 |         48 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             50.0% |                  91.7% |
| clean: multi-agent-baseline                                     |         48 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |                  - |             78.6% |                  98.6% |
| clean: duplicated-paragraphs                                    |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             28.6% |                  85.4% |
| clean: transient-search-error                                   |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             50.0% |                  93.8% |
| clean: search-outage                                            |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |              0.0% |                      - |
| clean: multi-agent-transient-search-error                       |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |                  - |             71.4% |                 100.0% |
| clean: multi-agent-search-outage                                |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |                  - |             26.7% |                      - |
| clean: empty-retrieval-abstained/filter-key-mismatch            |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |              0.0% |                   0.0% |
| clean: empty-retrieval-abstained/min-score-too-high             |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |              0.0% |                   0.0% |
| clean: empty-retrieval-abstained/zero-query-vector              |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |              0.0% |                   0.0% |
| clean: entity-swap/entity-swap-3                                |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             50.0% |                  93.8% |
| clean: parallel-retry/first-round-fails                         |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             28.6% |                  96.9% |
| clean: parallel-retry/every-search-fails                        |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |              0.0% |                      - |
| clean: mastra-default-chunking-short-documents                  |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             50.0% |                  93.8% |
| clean: clean-chunking-long-documents                            |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             14.3% |                  93.8% |
| default-chunk-size (embedding-coverage)                         |         16 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             100.0% |             14.3% |                 100.0% |
| embed-batch-cap (embedding-coverage)                            |         32 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             100.0% |              3.6% |                   4.2% |
| zero-vectors (embedding-coverage)                               |         32 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             100.0% |             39.3% |                  59.1% |
| vector-side-off (flat-score)                                    |         48 |     100.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |              33.3% |             33.3% |                  62.5% |
| empty-retrieval-answered-from-memory (empty-retrieval-answered) |         48 |       0.0% |                   100.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             23.8% |                   0.0% |
| swallowed-search-error (swallowed-tool-error)                   |         48 |       0.0% |                     0.0% |               100.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             35.7% |                  93.8% |
| repeated-search (tool-loop)                                     |         96 |       0.0% |                     0.0% |                 0.0% |    100.0% |                 0.0% |                  0.0% |               0.0% |             30.2% |                  94.4% |
| supervisor-no-ack (delegation-ping-pong)                        |         64 |       0.0% |                     0.0% |                 0.0% |      0.0% |               100.0% |                  0.0% |                  - |              7.1% |                  51.0% |
| supervisor-ignores-workers (ignored-worker-result)              |         32 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                100.0% |                  - |             28.6% |                  94.8% |

### Per detector

#### flat-score

- caught 48/48 = 100.0% [Wilson 95%: 92.6%, 100.0%]
    - vector-side-off / collapsed-embedder: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - vector-side-off / constant-fused-score: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - vector-side-off / non-finite-scores: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
- false alarms 0/208 = 0.0% [Wilson 95%: 0.0%, 1.8%; rule of three: 1.4%]
    - baseline: false alarms 0/48 = 0.0% [Wilson 95%: 0.0%, 7.4%; rule of three: 6.3%]
    - multi-agent-baseline: false alarms 0/48 = 0.0% [Wilson 95%: 0.0%, 7.4%; rule of three: 6.3%]
    - hard negative duplicated-paragraphs: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - transient-search-error: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - search-outage: false alarms 0/0 (no runs) (not applicable: 16)
    - multi-agent-transient-search-error: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - multi-agent-search-outage: false alarms 0/0 (no runs) (not applicable: 16)
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/0 (no runs) (not applicable: 16)
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/0 (no runs) (not applicable: 16)
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/0 (no runs) (not applicable: 16)
    - entity-swap/entity-swap-3: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - parallel-retry/first-round-fails: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - parallel-retry/every-search-fails: false alarms 0/0 (no runs) (not applicable: 16)
    - mastra-default-chunking-short-documents: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - clean-chunking-long-documents: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]

#### empty-retrieval-answered

- caught 48/48 = 100.0% [Wilson 95%: 92.6%, 100.0%]
    - empty-retrieval-answered-from-memory / filter-key-mismatch: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - empty-retrieval-answered-from-memory / min-score-too-high: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - empty-retrieval-answered-from-memory / zero-query-vector: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
- false alarms 0/256 = 0.0% [Wilson 95%: 0.0%, 1.5%; rule of three: 1.2%]
    - baseline: false alarms 0/48 = 0.0% [Wilson 95%: 0.0%, 7.4%; rule of three: 6.3%]
    - multi-agent-baseline: false alarms 0/48 = 0.0% [Wilson 95%: 0.0%, 7.4%; rule of three: 6.3%]
    - duplicated-paragraphs: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - transient-search-error: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative search-outage: false alarms 0/0 (no runs) (not applicable: 16)
    - multi-agent-transient-search-error: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - multi-agent-search-outage: false alarms 0/0 (no runs) (not applicable: 16)
    - hard negative empty-retrieval-abstained/filter-key-mismatch: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative empty-retrieval-abstained/min-score-too-high: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative empty-retrieval-abstained/zero-query-vector: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - entity-swap/entity-swap-3: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - parallel-retry/first-round-fails: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - parallel-retry/every-search-fails: false alarms 0/0 (no runs) (not applicable: 16)
    - mastra-default-chunking-short-documents: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - clean-chunking-long-documents: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]

#### swallowed-tool-error

- caught 48/48 = 100.0% [Wilson 95%: 92.6%, 100.0%]
    - swallowed-search-error / answer-without-retry: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - swallowed-search-error / retry-then-answer: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - swallowed-search-error / refinement-failed: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
- false alarms 0/304 = 0.0% [Wilson 95%: 0.0%, 1.2%; rule of three: 1.0%]
    - baseline: false alarms 0/48 = 0.0% [Wilson 95%: 0.0%, 7.4%; rule of three: 6.3%]
    - multi-agent-baseline: false alarms 0/48 = 0.0% [Wilson 95%: 0.0%, 7.4%; rule of three: 6.3%]
    - duplicated-paragraphs: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative transient-search-error: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative search-outage: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative multi-agent-transient-search-error: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative multi-agent-search-outage: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - entity-swap/entity-swap-3: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative parallel-retry/first-round-fails: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative parallel-retry/every-search-fails: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - mastra-default-chunking-short-documents: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - clean-chunking-long-documents: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]

#### tool-loop

- caught 96/96 = 100.0% [Wilson 95%: 96.2%, 100.0%]
    - repeated-search / repeat-3: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - repeated-search / repeat-5: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - repeated-search / repeat-until-step-budget: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - repeated-search / alternate-2-cycles: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - repeated-search / paraphrase-3: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - repeated-search / retry-failing-5: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
- false alarms 0/304 = 0.0% [Wilson 95%: 0.0%, 1.2%; rule of three: 1.0%]
    - baseline: false alarms 0/48 = 0.0% [Wilson 95%: 0.0%, 7.4%; rule of three: 6.3%]
    - hard negative multi-agent-baseline: false alarms 0/48 = 0.0% [Wilson 95%: 0.0%, 7.4%; rule of three: 6.3%]
    - duplicated-paragraphs: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative transient-search-error: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - search-outage: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative multi-agent-transient-search-error: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - multi-agent-search-outage: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative entity-swap/entity-swap-3: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative parallel-retry/first-round-fails: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative parallel-retry/every-search-fails: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - mastra-default-chunking-short-documents: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - clean-chunking-long-documents: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]

#### delegation-ping-pong

- caught 64/64 = 100.0% [Wilson 95%: 94.3%, 100.0%]
    - supervisor-no-ack / redelegate-3: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - supervisor-no-ack / redelegate-4: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - supervisor-no-ack / redelegate-6: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - supervisor-no-ack / bounce-2-rounds: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
- false alarms 0/80 = 0.0% [Wilson 95%: 0.0%, 4.6%; rule of three: 3.8%]
    - baseline: false alarms 0/0 (no runs) (not applicable: 48)
    - hard negative multi-agent-baseline: false alarms 0/48 = 0.0% [Wilson 95%: 0.0%, 7.4%; rule of three: 6.3%]
    - duplicated-paragraphs: false alarms 0/0 (no runs) (not applicable: 16)
    - transient-search-error: false alarms 0/0 (no runs) (not applicable: 16)
    - search-outage: false alarms 0/0 (no runs) (not applicable: 16)
    - hard negative multi-agent-transient-search-error: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative multi-agent-search-outage: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/0 (no runs) (not applicable: 16)
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/0 (no runs) (not applicable: 16)
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/0 (no runs) (not applicable: 16)
    - entity-swap/entity-swap-3: false alarms 0/0 (no runs) (not applicable: 16)
    - parallel-retry/first-round-fails: false alarms 0/0 (no runs) (not applicable: 16)
    - parallel-retry/every-search-fails: false alarms 0/0 (no runs) (not applicable: 16)
    - mastra-default-chunking-short-documents: false alarms 0/0 (no runs) (not applicable: 16)
    - clean-chunking-long-documents: false alarms 0/0 (no runs) (not applicable: 16)

#### ignored-worker-result

- caught 32/32 = 100.0% [Wilson 95%: 89.3%, 100.0%]
    - supervisor-ignores-workers / answer-from-prior: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - supervisor-ignores-workers / override-one-worker: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
- false alarms 0/71 = 0.0% [Wilson 95%: 0.0%, 5.1%; rule of three: 4.2%]
    - baseline: false alarms 0/0 (no runs) (not applicable: 48)
    - hard negative multi-agent-baseline: false alarms 0/48 = 0.0% [Wilson 95%: 0.0%, 7.4%; rule of three: 6.3%]
    - duplicated-paragraphs: false alarms 0/0 (no runs) (not applicable: 16)
    - transient-search-error: false alarms 0/0 (no runs) (not applicable: 16)
    - search-outage: false alarms 0/0 (no runs) (not applicable: 16)
    - multi-agent-transient-search-error: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative multi-agent-search-outage: false alarms 0/7 = 0.0% [Wilson 95%: 0.0%, 35.4%] (not applicable: 9)
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/0 (no runs) (not applicable: 16)
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/0 (no runs) (not applicable: 16)
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/0 (no runs) (not applicable: 16)
    - entity-swap/entity-swap-3: false alarms 0/0 (no runs) (not applicable: 16)
    - parallel-retry/first-round-fails: false alarms 0/0 (no runs) (not applicable: 16)
    - parallel-retry/every-search-fails: false alarms 0/0 (no runs) (not applicable: 16)
    - mastra-default-chunking-short-documents: false alarms 0/0 (no runs) (not applicable: 16)
    - clean-chunking-long-documents: false alarms 0/0 (no runs) (not applicable: 16)

#### embedding-coverage

- caught 80/80 = 100.0% [Wilson 95%: 95.4%, 100.0%]
    - default-chunk-size / mastra-defaults: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - embed-batch-cap / keeps-7-of-8: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - embed-batch-cap / keeps-4-of-8: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - zero-vectors / every-tenth: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
    - zero-vectors / every-second: caught 16/16 = 100.0% [Wilson 95%: 80.6%, 100.0%]
- false alarms 0/192 = 0.0% [Wilson 95%: 0.0%, 2.0%; rule of three: 1.6%]
    - baseline: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - duplicated-paragraphs: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - transient-search-error: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - search-outage: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - entity-swap/entity-swap-3: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - parallel-retry/first-round-fails: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - parallel-retry/every-search-fails: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative mastra-default-chunking-short-documents: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]
    - hard negative clean-chunking-long-documents: false alarms 0/16 = 0.0% [Wilson 95%: 0.0%, 19.4%]

### Cross-fault matrix (fired / scored runs; own fault in bold)

| condition                                                  | flat-score | empty-retrieval-answered | swallowed-tool-error | tool-loop | delegation-ping-pong | ignored-worker-result | embedding-coverage |
| ---------------------------------------------------------- | ---------: | -----------------------: | -------------------: | --------: | -------------------: | --------------------: | -----------------: |
| clean: baseline                                            |       0/48 |                     0/48 |                 0/48 |      0/48 |                 0/48 |                  0/48 |               0/16 |
| clean: multi-agent-baseline                                |       0/48 |                     0/48 |                 0/48 |      0/48 |                 0/48 |                  0/48 |                  - |
| clean: duplicated-paragraphs                               |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| clean: transient-search-error                              |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| clean: search-outage                                       |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| clean: multi-agent-transient-search-error                  |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |                  - |
| clean: multi-agent-search-outage                           |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |                  - |
| clean: empty-retrieval-abstained/filter-key-mismatch       |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| clean: empty-retrieval-abstained/min-score-too-high        |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| clean: empty-retrieval-abstained/zero-query-vector         |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| clean: entity-swap/entity-swap-3                           |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| clean: parallel-retry/first-round-fails                    |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| clean: parallel-retry/every-search-fails                   |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| clean: mastra-default-chunking-short-documents             |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| clean: clean-chunking-long-documents                       |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| default-chunk-size / mastra-defaults                       |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |          **16/16** |
| embed-batch-cap / keeps-7-of-8                             |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |          **16/16** |
| embed-batch-cap / keeps-4-of-8                             |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |          **16/16** |
| zero-vectors / every-tenth                                 |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |          **16/16** |
| zero-vectors / every-second                                |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |          **16/16** |
| vector-side-off / collapsed-embedder                       |  **16/16** |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |              16/16 |
| vector-side-off / constant-fused-score                     |  **16/16** |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| vector-side-off / non-finite-scores                        |  **16/16** |                     0/16 |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| empty-retrieval-answered-from-memory / filter-key-mismatch |       0/16 |                **16/16** |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| empty-retrieval-answered-from-memory / min-score-too-high  |       0/16 |                **16/16** |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| empty-retrieval-answered-from-memory / zero-query-vector   |       0/16 |                **16/16** |                 0/16 |      0/16 |                 0/16 |                  0/16 |               0/16 |
| swallowed-search-error / answer-without-retry              |       0/16 |                     0/16 |            **16/16** |      0/16 |                 0/16 |                  0/16 |               0/16 |
| swallowed-search-error / retry-then-answer                 |       0/16 |                     0/16 |            **16/16** |      0/16 |                 0/16 |                  0/16 |               0/16 |
| swallowed-search-error / refinement-failed                 |       0/16 |                     0/16 |            **16/16** |      0/16 |                 0/16 |                  0/16 |               0/16 |
| repeated-search / repeat-3                                 |       0/16 |                     0/16 |                 0/16 | **16/16** |                 0/16 |                  0/16 |               0/16 |
| repeated-search / repeat-5                                 |       0/16 |                     0/16 |                 0/16 | **16/16** |                 0/16 |                  0/16 |               0/16 |
| repeated-search / repeat-until-step-budget                 |       0/16 |                     0/16 |                 0/16 | **16/16** |                 0/16 |                  0/16 |               0/16 |
| repeated-search / alternate-2-cycles                       |       0/16 |                     0/16 |                 0/16 | **16/16** |                 0/16 |                  0/16 |               0/16 |
| repeated-search / paraphrase-3                             |       0/16 |                     0/16 |                 0/16 | **16/16** |                 0/16 |                  0/16 |               0/16 |
| repeated-search / retry-failing-5                          |       0/16 |                     0/16 |                 0/16 | **16/16** |                 0/16 |                  0/16 |               0/16 |
| supervisor-no-ack / redelegate-3                           |       0/16 |                     0/16 |                 0/16 |      0/16 |            **16/16** |                  0/16 |                  - |
| supervisor-no-ack / redelegate-4                           |       0/16 |                     0/16 |                 0/16 |      0/16 |            **16/16** |                  0/16 |                  - |
| supervisor-no-ack / redelegate-6                           |       0/16 |                     0/16 |                 0/16 |      0/16 |            **16/16** |                  0/16 |                  - |
| supervisor-no-ack / bounce-2-rounds                        |       0/16 |                     0/16 |                 0/16 |      0/16 |            **16/16** |                  0/16 |                  - |
| supervisor-ignores-workers / answer-from-prior             |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |             **16/16** |                  - |
| supervisor-ignores-workers / override-one-worker           |       0/16 |                     0/16 |                 0/16 |      0/16 |                 0/16 |             **16/16** |                  - |

### Threshold sensitivity (one threshold at a time, the others at their defaults)

| entry                    | threshold              |              value | caught (expressed runs) | false alarms (judged clean runs) |
| ------------------------ | ---------------------- | -----------------: | ----------------------- | -------------------------------- |
| flat-score               | MIN_HITS               |                  1 | 48/48 100.0%            | 0/208 0.0%                       |
| flat-score               | MIN_HITS               |                  2 | 48/48 100.0%            | 0/208 0.0%                       |
| flat-score               | MIN_HITS               |        3 (default) | 48/48 100.0%            | 0/208 0.0%                       |
| flat-score               | MIN_HITS               |                  4 | 48/48 100.0%            | 0/208 0.0%                       |
| flat-score               | MIN_HITS               |                  5 | 48/48 100.0%            | 0/208 0.0%                       |
| flat-score               | MIN_HITS               |                  6 | 0/48 0.0%               | - -                              |
| flat-score               | MAX_FLAT_SPREAD        |               1e-9 | 48/48 100.0%            | 0/208 0.0%                       |
| flat-score               | MAX_FLAT_SPREAD        | 0.000001 (default) | 48/48 100.0%            | 0/208 0.0%                       |
| flat-score               | MAX_FLAT_SPREAD        |             0.0001 | 48/48 100.0%            | 0/208 0.0%                       |
| flat-score               | MAX_FLAT_SPREAD        |               0.01 | 48/48 100.0%            | 0/208 0.0%                       |
| flat-score               | MAX_FLAT_SPREAD        |               0.02 | 48/48 100.0%            | 3/208 1.4%                       |
| flat-score               | MAX_FLAT_SPREAD        |               0.05 | 48/48 100.0%            | 24/208 11.5%                     |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |        0 (default) | 48/48 100.0%            | 0/256 0.0%                       |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |                  1 | 48/48 100.0%            | 0/256 0.0%                       |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |                  3 | 48/48 100.0%            | 0/256 0.0%                       |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |                  5 | 48/48 100.0%            | 208/256 81.3%                    |
| tool-loop                | MIN_REPEATS            |                  2 | 96/96 100.0%            | 27/304 8.9%                      |
| tool-loop                | MIN_REPEATS            |        3 (default) | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | MIN_REPEATS            |                  4 | 64/96 66.7%             | 0/304 0.0%                       |
| tool-loop                | MIN_REPEATS            |                  5 | 64/96 66.7%             | 0/304 0.0%                       |
| tool-loop                | MIN_REPEATS            |                  6 | 32/96 33.3%             | 0/304 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.5 | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.6 | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.7 | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |      0.8 (default) | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.9 | 90/96 93.8%             | 0/304 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                  1 | 80/96 83.3%             | 0/304 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  1 | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  2 | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |        3 (default) | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  5 | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  8 | 93/96 96.9%             | 0/304 0.0%                       |
| tool-loop                | MIN_CYCLES             |                  1 | 96/96 100.0%            | 75/304 24.7%                     |
| tool-loop                | MIN_CYCLES             |        2 (default) | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | MIN_CYCLES             |                  3 | 80/96 83.3%             | 0/304 0.0%                       |
| tool-loop                | MAX_RETRIES            |                  0 | 96/96 100.0%            | 32/304 10.5%                     |
| tool-loop                | MAX_RETRIES            |                  1 | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | MAX_RETRIES            |        2 (default) | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | MAX_RETRIES            |                  3 | 96/96 100.0%            | 0/304 0.0%                       |
| tool-loop                | MAX_RETRIES            |                  5 | 80/96 83.3%             | 0/304 0.0%                       |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  2 | 64/64 100.0%            | 15/80 18.8%                      |
| delegation-ping-pong     | MIN_REDELEGATIONS      |        3 (default) | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  4 | 48/64 75.0%             | 0/80 0.0%                        |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  5 | 32/64 50.0%             | 0/80 0.0%                        |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  7 | 16/64 25.0%             | 0/80 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.5 | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.6 | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.7 | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |      0.8 (default) | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.9 | 36/64 56.3%             | 0/80 0.0%                        |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                  1 | 32/64 50.0%             | 0/80 0.0%                        |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                0.5 | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                0.7 | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                0.8 | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |      0.9 (default) | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                  1 | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |                  3 | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |        4 (default) | 64/64 100.0%            | 0/80 0.0%                        |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |                  5 | 48/64 75.0%             | 0/80 0.0%                        |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |                  6 | 48/64 75.0%             | 0/80 0.0%                        |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |        0 (default) | 32/32 100.0%            | 0/71 0.0%                        |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |                0.1 | 32/32 100.0%            | 0/71 0.0%                        |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |               0.25 | 32/32 100.0%            | 0/71 0.0%                        |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |                0.5 | 32/32 100.0%            | 0/71 0.0%                        |
| embedding-coverage       | MAX_MISSING_CHUNKS     |        0 (default) | 80/80 100.0%            | 0/192 0.0%                       |
| embedding-coverage       | MAX_MISSING_CHUNKS     |                  1 | 64/80 80.0%             | 0/192 0.0%                       |
| embedding-coverage       | MAX_MISSING_CHUNKS     |                  5 | 48/80 60.0%             | 0/192 0.0%                       |
| embedding-coverage       | MAX_MISSING_CHUNKS     |                 20 | 48/80 60.0%             | 0/192 0.0%                       |
| embedding-coverage       | MAX_OVER_LIMIT_CHUNKS  |        0 (default) | 80/80 100.0%            | 0/192 0.0%                       |
| embedding-coverage       | MAX_OVER_LIMIT_CHUNKS  |                  1 | 71/80 88.8%             | 0/192 0.0%                       |
| embedding-coverage       | MAX_OVER_LIMIT_CHUNKS  |                  5 | 64/80 80.0%             | 0/192 0.0%                       |
| embedding-coverage       | MAX_OVER_LIMIT_CHUNKS  |                 20 | 64/80 80.0%             | 0/192 0.0%                       |
| embedding-coverage       | MAX_DEGENERATE_VECTORS |        0 (default) | 80/80 100.0%            | 0/192 0.0%                       |
| embedding-coverage       | MAX_DEGENERATE_VECTORS |                  1 | 73/80 91.3%             | 0/192 0.0%                       |
| embedding-coverage       | MAX_DEGENERATE_VECTORS |                  5 | 57/80 71.3%             | 0/192 0.0%                       |
| embedding-coverage       | MAX_DEGENERATE_VECTORS |                 20 | 48/80 60.0%             | 0/192 0.0%                       |

## Held-out split: 1176 agent runs, 768 ingestions

### Headline (share of scored runs each detector fired on: agent runs for run entries, ingestions for embedding-coverage; recall@k at the family top K)

| condition                                                       | agent runs | flat-score | empty-retrieval-answered | swallowed-tool-error | tool-loop | delegation-ping-pong | ignored-worker-result | embedding-coverage | gold answer found | gold sentence recall@k |
| --------------------------------------------------------------- | ---------: | ---------: | -----------------------: | -------------------: | --------: | -------------------: | --------------------: | -----------------: | ----------------: | ---------------------: |
| clean: baseline                                                 |        120 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             68.9% |                  95.3% |
| clean: multi-agent-baseline                                     |        120 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |                  - |             71.1% |                  98.1% |
| clean: duplicated-paragraphs                                    |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             33.3% |                  93.1% |
| clean: transient-search-error                                   |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             66.7% |                  95.8% |
| clean: search-outage                                            |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |              0.0% |                      - |
| clean: multi-agent-transient-search-error                       |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |                  - |             72.2% |                  95.1% |
| clean: multi-agent-search-outage                                |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |                  - |             14.3% |                      - |
| clean: empty-retrieval-abstained/filter-key-mismatch            |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |              0.0% |                   0.0% |
| clean: empty-retrieval-abstained/min-score-too-high             |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |              0.0% |                   0.0% |
| clean: empty-retrieval-abstained/zero-query-vector              |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |              0.0% |                   0.0% |
| clean: entity-swap/entity-swap-3                                |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             66.7% |                  97.9% |
| clean: parallel-retry/first-round-fails                         |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             61.1% |                  93.8% |
| clean: parallel-retry/every-search-fails                        |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |              0.0% |                      - |
| clean: mastra-default-chunking-short-documents                  |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             66.7% |                  97.9% |
| clean: clean-chunking-long-documents                            |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             27.8% |                  98.6% |
| default-chunk-size (embedding-coverage)                         |         24 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |              87.5% |             33.3% |                  97.2% |
| embed-batch-cap (embedding-coverage)                            |         48 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |              91.7% |              5.6% |                   5.1% |
| zero-vectors (embedding-coverage)                               |         48 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |             100.0% |             55.6% |                  56.9% |
| vector-side-off (flat-score)                                    |         72 |     100.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |              33.3% |             46.3% |                  65.4% |
| empty-retrieval-answered-from-memory (empty-retrieval-answered) |         72 |       0.0% |                   100.0% |                 0.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             20.4% |                   0.0% |
| swallowed-search-error (swallowed-tool-error)                   |         72 |       0.0% |                     0.0% |               100.0% |      0.0% |                 0.0% |                  0.0% |               0.0% |             44.4% |                  97.9% |
| repeated-search (tool-loop)                                     |        144 |       0.0% |                     0.0% |                 0.0% |    100.0% |                 0.0% |                  0.0% |               0.0% |             41.4% |                  97.1% |
| supervisor-no-ack (delegation-ping-pong)                        |         96 |       0.0% |                     0.0% |                 0.0% |      0.0% |               100.0% |                  0.0% |                  - |             37.5% |                  50.4% |
| supervisor-ignores-workers (ignored-worker-result)              |         48 |       0.0% |                     0.0% |                 0.0% |      0.0% |                 0.0% |                 95.8% |                  - |             41.7% |                  95.5% |

### Per detector

#### flat-score

- caught 72/72 = 100.0% [Wilson 95%: 94.9%, 100.0%]
    - vector-side-off / collapsed-embedder: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - vector-side-off / constant-fused-score: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - vector-side-off / non-finite-scores: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/408 = 0.0% [Wilson 95%: 0.0%, 0.9%; rule of three: 0.7%]
    - baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - multi-agent-baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - hard negative duplicated-paragraphs: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - search-outage: false alarms 0/0 (no runs) (not applicable: 24)
    - multi-agent-transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - multi-agent-search-outage: false alarms 0/0 (no runs) (not applicable: 24)
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/0 (no runs) (not applicable: 24)
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/0 (no runs) (not applicable: 24)
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/0 (no runs) (not applicable: 24)
    - entity-swap/entity-swap-3: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - parallel-retry/first-round-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - parallel-retry/every-search-fails: false alarms 0/0 (no runs) (not applicable: 24)
    - mastra-default-chunking-short-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - clean-chunking-long-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]

#### empty-retrieval-answered

- caught 72/72 = 100.0% [Wilson 95%: 94.9%, 100.0%]
    - empty-retrieval-answered-from-memory / filter-key-mismatch: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - empty-retrieval-answered-from-memory / min-score-too-high: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - empty-retrieval-answered-from-memory / zero-query-vector: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/480 = 0.0% [Wilson 95%: 0.0%, 0.8%; rule of three: 0.6%]
    - baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - multi-agent-baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - duplicated-paragraphs: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative search-outage: false alarms 0/0 (no runs) (not applicable: 24)
    - multi-agent-transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - multi-agent-search-outage: false alarms 0/0 (no runs) (not applicable: 24)
    - hard negative empty-retrieval-abstained/filter-key-mismatch: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative empty-retrieval-abstained/min-score-too-high: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative empty-retrieval-abstained/zero-query-vector: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - entity-swap/entity-swap-3: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - parallel-retry/first-round-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - parallel-retry/every-search-fails: false alarms 0/0 (no runs) (not applicable: 24)
    - mastra-default-chunking-short-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - clean-chunking-long-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]

#### swallowed-tool-error

- caught 72/72 = 100.0% [Wilson 95%: 94.9%, 100.0%]
    - swallowed-search-error / answer-without-retry: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - swallowed-search-error / retry-then-answer: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - swallowed-search-error / refinement-failed: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/552 = 0.0% [Wilson 95%: 0.0%, 0.7%; rule of three: 0.5%]
    - baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - multi-agent-baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - duplicated-paragraphs: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative search-outage: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative multi-agent-transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative multi-agent-search-outage: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - entity-swap/entity-swap-3: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative parallel-retry/first-round-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative parallel-retry/every-search-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - mastra-default-chunking-short-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - clean-chunking-long-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]

#### tool-loop

- caught 144/144 = 100.0% [Wilson 95%: 97.4%, 100.0%]
    - repeated-search / repeat-3: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - repeated-search / repeat-5: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - repeated-search / repeat-until-step-budget: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - repeated-search / alternate-2-cycles: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - repeated-search / paraphrase-3: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - repeated-search / retry-failing-5: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/552 = 0.0% [Wilson 95%: 0.0%, 0.7%; rule of three: 0.5%]
    - baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - hard negative multi-agent-baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - duplicated-paragraphs: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - search-outage: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative multi-agent-transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - multi-agent-search-outage: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative entity-swap/entity-swap-3: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative parallel-retry/first-round-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative parallel-retry/every-search-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - mastra-default-chunking-short-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - clean-chunking-long-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]

#### delegation-ping-pong

- caught 96/96 = 100.0% [Wilson 95%: 96.2%, 100.0%]
    - supervisor-no-ack / redelegate-3: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - supervisor-no-ack / redelegate-4: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - supervisor-no-ack / redelegate-6: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - supervisor-no-ack / bounce-2-rounds: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/168 = 0.0% [Wilson 95%: 0.0%, 2.2%; rule of three: 1.8%]
    - baseline: false alarms 0/0 (no runs) (not applicable: 120)
    - hard negative multi-agent-baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - duplicated-paragraphs: false alarms 0/0 (no runs) (not applicable: 24)
    - transient-search-error: false alarms 0/0 (no runs) (not applicable: 24)
    - search-outage: false alarms 0/0 (no runs) (not applicable: 24)
    - hard negative multi-agent-transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative multi-agent-search-outage: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/0 (no runs) (not applicable: 24)
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/0 (no runs) (not applicable: 24)
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/0 (no runs) (not applicable: 24)
    - entity-swap/entity-swap-3: false alarms 0/0 (no runs) (not applicable: 24)
    - parallel-retry/first-round-fails: false alarms 0/0 (no runs) (not applicable: 24)
    - parallel-retry/every-search-fails: false alarms 0/0 (no runs) (not applicable: 24)
    - mastra-default-chunking-short-documents: false alarms 0/0 (no runs) (not applicable: 24)
    - clean-chunking-long-documents: false alarms 0/0 (no runs) (not applicable: 24)

#### ignored-worker-result

- caught 46/48 = 95.8% [Wilson 95%: 86.0%, 98.8%]
    - supervisor-ignores-workers / answer-from-prior: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - supervisor-ignores-workers / override-one-worker: caught 22/24 = 91.7% [Wilson 95%: 74.2%, 97.7%]
- false alarms 0/152 = 0.0% [Wilson 95%: 0.0%, 2.5%; rule of three: 2.0%]
    - baseline: false alarms 0/0 (no runs) (not applicable: 120)
    - hard negative multi-agent-baseline: false alarms 0/118 = 0.0% [Wilson 95%: 0.0%, 3.2%; rule of three: 2.5%] (not applicable: 2)
    - duplicated-paragraphs: false alarms 0/0 (no runs) (not applicable: 24)
    - transient-search-error: false alarms 0/0 (no runs) (not applicable: 24)
    - search-outage: false alarms 0/0 (no runs) (not applicable: 24)
    - multi-agent-transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative multi-agent-search-outage: false alarms 0/10 = 0.0% [Wilson 95%: 0.0%, 27.8%] (not applicable: 14)
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/0 (no runs) (not applicable: 24)
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/0 (no runs) (not applicable: 24)
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/0 (no runs) (not applicable: 24)
    - entity-swap/entity-swap-3: false alarms 0/0 (no runs) (not applicable: 24)
    - parallel-retry/first-round-fails: false alarms 0/0 (no runs) (not applicable: 24)
    - parallel-retry/every-search-fails: false alarms 0/0 (no runs) (not applicable: 24)
    - mastra-default-chunking-short-documents: false alarms 0/0 (no runs) (not applicable: 24)
    - clean-chunking-long-documents: false alarms 0/0 (no runs) (not applicable: 24)

#### embedding-coverage

- caught 113/120 = 94.2% [Wilson 95%: 88.4%, 97.1%]; not expressed: 7; caught when expressed 113/113 = 100.0% [Wilson 95%: 96.7%, 100.0%]
    - default-chunk-size / mastra-defaults: caught 21/24 = 87.5% [Wilson 95%: 69.0%, 95.7%]; not expressed: 3; caught when expressed 21/21 = 100.0% [Wilson 95%: 84.5%, 100.0%]
    - embed-batch-cap / keeps-7-of-8: caught 22/24 = 91.7% [Wilson 95%: 74.2%, 97.7%]; not expressed: 2; caught when expressed 22/22 = 100.0% [Wilson 95%: 85.1%, 100.0%]
    - embed-batch-cap / keeps-4-of-8: caught 22/24 = 91.7% [Wilson 95%: 74.2%, 97.7%]; not expressed: 2; caught when expressed 22/22 = 100.0% [Wilson 95%: 85.1%, 100.0%]
    - zero-vectors / every-tenth: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - zero-vectors / every-second: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/288 = 0.0% [Wilson 95%: 0.0%, 1.3%; rule of three: 1.0%]
    - baseline: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - duplicated-paragraphs: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - search-outage: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - empty-retrieval-abstained/filter-key-mismatch: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - empty-retrieval-abstained/min-score-too-high: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - empty-retrieval-abstained/zero-query-vector: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - entity-swap/entity-swap-3: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - parallel-retry/first-round-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - parallel-retry/every-search-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative mastra-default-chunking-short-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative clean-chunking-long-documents: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]

### Cross-fault matrix (fired / scored runs; own fault in bold)

| condition                                                  | flat-score | empty-retrieval-answered | swallowed-tool-error | tool-loop | delegation-ping-pong | ignored-worker-result | embedding-coverage |
| ---------------------------------------------------------- | ---------: | -----------------------: | -------------------: | --------: | -------------------: | --------------------: | -----------------: |
| clean: baseline                                            |      0/120 |                    0/120 |                0/120 |     0/120 |                0/120 |                 0/120 |               0/24 |
| clean: multi-agent-baseline                                |      0/120 |                    0/120 |                0/120 |     0/120 |                0/120 |                 0/120 |                  - |
| clean: duplicated-paragraphs                               |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| clean: transient-search-error                              |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| clean: search-outage                                       |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| clean: multi-agent-transient-search-error                  |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |                  - |
| clean: multi-agent-search-outage                           |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |                  - |
| clean: empty-retrieval-abstained/filter-key-mismatch       |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| clean: empty-retrieval-abstained/min-score-too-high        |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| clean: empty-retrieval-abstained/zero-query-vector         |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| clean: entity-swap/entity-swap-3                           |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| clean: parallel-retry/first-round-fails                    |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| clean: parallel-retry/every-search-fails                   |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| clean: mastra-default-chunking-short-documents             |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| clean: clean-chunking-long-documents                       |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| default-chunk-size / mastra-defaults                       |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |          **21/24** |
| embed-batch-cap / keeps-7-of-8                             |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |          **22/24** |
| embed-batch-cap / keeps-4-of-8                             |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |          **22/24** |
| zero-vectors / every-tenth                                 |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |          **24/24** |
| zero-vectors / every-second                                |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |          **24/24** |
| vector-side-off / collapsed-embedder                       |  **24/24** |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |              24/24 |
| vector-side-off / constant-fused-score                     |  **24/24** |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| vector-side-off / non-finite-scores                        |  **24/24** |                     0/24 |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| empty-retrieval-answered-from-memory / filter-key-mismatch |       0/24 |                **24/24** |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| empty-retrieval-answered-from-memory / min-score-too-high  |       0/24 |                **24/24** |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| empty-retrieval-answered-from-memory / zero-query-vector   |       0/24 |                **24/24** |                 0/24 |      0/24 |                 0/24 |                  0/24 |               0/24 |
| swallowed-search-error / answer-without-retry              |       0/24 |                     0/24 |            **24/24** |      0/24 |                 0/24 |                  0/24 |               0/24 |
| swallowed-search-error / retry-then-answer                 |       0/24 |                     0/24 |            **24/24** |      0/24 |                 0/24 |                  0/24 |               0/24 |
| swallowed-search-error / refinement-failed                 |       0/24 |                     0/24 |            **24/24** |      0/24 |                 0/24 |                  0/24 |               0/24 |
| repeated-search / repeat-3                                 |       0/24 |                     0/24 |                 0/24 | **24/24** |                 0/24 |                  0/24 |               0/24 |
| repeated-search / repeat-5                                 |       0/24 |                     0/24 |                 0/24 | **24/24** |                 0/24 |                  0/24 |               0/24 |
| repeated-search / repeat-until-step-budget                 |       0/24 |                     0/24 |                 0/24 | **24/24** |                 0/24 |                  0/24 |               0/24 |
| repeated-search / alternate-2-cycles                       |       0/24 |                     0/24 |                 0/24 | **24/24** |                 0/24 |                  0/24 |               0/24 |
| repeated-search / paraphrase-3                             |       0/24 |                     0/24 |                 0/24 | **24/24** |                 0/24 |                  0/24 |               0/24 |
| repeated-search / retry-failing-5                          |       0/24 |                     0/24 |                 0/24 | **24/24** |                 0/24 |                  0/24 |               0/24 |
| supervisor-no-ack / redelegate-3                           |       0/24 |                     0/24 |                 0/24 |      0/24 |            **24/24** |                  0/24 |                  - |
| supervisor-no-ack / redelegate-4                           |       0/24 |                     0/24 |                 0/24 |      0/24 |            **24/24** |                  0/24 |                  - |
| supervisor-no-ack / redelegate-6                           |       0/24 |                     0/24 |                 0/24 |      0/24 |            **24/24** |                  0/24 |                  - |
| supervisor-no-ack / bounce-2-rounds                        |       0/24 |                     0/24 |                 0/24 |      0/24 |            **24/24** |                  0/24 |                  - |
| supervisor-ignores-workers / answer-from-prior             |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |             **24/24** |                  - |
| supervisor-ignores-workers / override-one-worker           |       0/24 |                     0/24 |                 0/24 |      0/24 |                 0/24 |             **22/24** |                  - |

### Threshold sensitivity (one threshold at a time, the others at their defaults)

| entry                    | threshold              |              value | caught (expressed runs) | false alarms (judged clean runs) |
| ------------------------ | ---------------------- | -----------------: | ----------------------- | -------------------------------- |
| flat-score               | MIN_HITS               |                  1 | 72/72 100.0%            | 0/408 0.0%                       |
| flat-score               | MIN_HITS               |                  2 | 72/72 100.0%            | 0/408 0.0%                       |
| flat-score               | MIN_HITS               |        3 (default) | 72/72 100.0%            | 0/408 0.0%                       |
| flat-score               | MIN_HITS               |                  4 | 48/72 66.7%             | 0/272 0.0%                       |
| flat-score               | MIN_HITS               |                  5 | 48/72 66.7%             | 0/272 0.0%                       |
| flat-score               | MIN_HITS               |                  6 | 24/72 33.3%             | 0/136 0.0%                       |
| flat-score               | MAX_FLAT_SPREAD        |               1e-9 | 72/72 100.0%            | 0/408 0.0%                       |
| flat-score               | MAX_FLAT_SPREAD        | 0.000001 (default) | 72/72 100.0%            | 0/408 0.0%                       |
| flat-score               | MAX_FLAT_SPREAD        |             0.0001 | 72/72 100.0%            | 0/408 0.0%                       |
| flat-score               | MAX_FLAT_SPREAD        |               0.01 | 72/72 100.0%            | 5/408 1.2%                       |
| flat-score               | MAX_FLAT_SPREAD        |               0.02 | 72/72 100.0%            | 20/408 4.9%                      |
| flat-score               | MAX_FLAT_SPREAD        |               0.05 | 72/72 100.0%            | 79/408 19.4%                     |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |        0 (default) | 72/72 100.0%            | 0/480 0.0%                       |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |                  1 | 72/72 100.0%            | 0/480 0.0%                       |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |                  3 | 72/72 100.0%            | 136/480 28.3%                    |
| empty-retrieval-answered | MAX_HITS_FOR_EMPTY     |                  5 | 72/72 100.0%            | 272/480 56.7%                    |
| tool-loop                | MIN_REPEATS            |                  2 | 144/144 100.0%          | 47/552 8.5%                      |
| tool-loop                | MIN_REPEATS            |        3 (default) | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | MIN_REPEATS            |                  4 | 96/144 66.7%            | 0/552 0.0%                       |
| tool-loop                | MIN_REPEATS            |                  5 | 96/144 66.7%            | 0/552 0.0%                       |
| tool-loop                | MIN_REPEATS            |                  6 | 48/144 33.3%            | 0/552 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.5 | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.6 | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.7 | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |      0.8 (default) | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                0.9 | 135/144 93.8%           | 0/552 0.0%                       |
| tool-loop                | ARG_SIMILARITY         |                  1 | 120/144 83.3%           | 0/552 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  1 | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  2 | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |        3 (default) | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  5 | 143/144 99.3%           | 0/552 0.0%                       |
| tool-loop                | MIN_QUERY_TERMS        |                  8 | 137/144 95.1%           | 0/552 0.0%                       |
| tool-loop                | MIN_CYCLES             |                  1 | 144/144 100.0%          | 162/552 29.3%                    |
| tool-loop                | MIN_CYCLES             |        2 (default) | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | MIN_CYCLES             |                  3 | 120/144 83.3%           | 0/552 0.0%                       |
| tool-loop                | MAX_RETRIES            |                  0 | 144/144 100.0%          | 48/552 8.7%                      |
| tool-loop                | MAX_RETRIES            |                  1 | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | MAX_RETRIES            |        2 (default) | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | MAX_RETRIES            |                  3 | 144/144 100.0%          | 0/552 0.0%                       |
| tool-loop                | MAX_RETRIES            |                  5 | 120/144 83.3%           | 0/552 0.0%                       |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  2 | 96/96 100.0%            | 22/168 13.1%                     |
| delegation-ping-pong     | MIN_REDELEGATIONS      |        3 (default) | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  4 | 72/96 75.0%             | 0/168 0.0%                       |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  5 | 48/96 50.0%             | 0/168 0.0%                       |
| delegation-ping-pong     | MIN_REDELEGATIONS      |                  7 | 24/96 25.0%             | 0/168 0.0%                       |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.5 | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.6 | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.7 | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | PROMPT_SIMILARITY      |      0.8 (default) | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                0.9 | 78/96 81.3%             | 0/168 0.0%                       |
| delegation-ping-pong     | PROMPT_SIMILARITY      |                  1 | 48/96 50.0%             | 0/168 0.0%                       |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                0.5 | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                0.7 | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                0.8 | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |      0.9 (default) | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | WORKER_TEXT_SIMILARITY |                  1 | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |                  3 | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |        4 (default) | 96/96 100.0%            | 0/168 0.0%                       |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |                  5 | 72/96 75.0%             | 0/168 0.0%                       |
| delegation-ping-pong     | MIN_BOUNCE_LENGTH      |                  6 | 72/96 75.0%             | 0/168 0.0%                       |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |        0 (default) | 46/48 95.8%             | 0/152 0.0%                       |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |                0.1 | 46/48 95.8%             | 0/152 0.0%                       |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |               0.25 | 46/48 95.8%             | 0/152 0.0%                       |
| ignored-worker-result    | MAX_IGNORED_OVERLAP    |                0.5 | 47/48 97.9%             | 0/152 0.0%                       |
| embedding-coverage       | MAX_MISSING_CHUNKS     |        0 (default) | 113/113 100.0%          | 0/288 0.0%                       |
| embedding-coverage       | MAX_MISSING_CHUNKS     |                  1 | 95/113 84.1%            | 0/288 0.0%                       |
| embedding-coverage       | MAX_MISSING_CHUNKS     |                  5 | 74/113 65.5%            | 0/288 0.0%                       |
| embedding-coverage       | MAX_MISSING_CHUNKS     |                 20 | 69/113 61.1%            | 0/288 0.0%                       |
| embedding-coverage       | MAX_OVER_LIMIT_CHUNKS  |        0 (default) | 113/113 100.0%          | 0/288 0.0%                       |
| embedding-coverage       | MAX_OVER_LIMIT_CHUNKS  |                  1 | 105/113 92.9%           | 0/288 0.0%                       |
| embedding-coverage       | MAX_OVER_LIMIT_CHUNKS  |                  5 | 92/113 81.4%            | 0/288 0.0%                       |
| embedding-coverage       | MAX_OVER_LIMIT_CHUNKS  |                 20 | 92/113 81.4%            | 0/288 0.0%                       |
| embedding-coverage       | MAX_DEGENERATE_VECTORS |        0 (default) | 113/113 100.0%          | 0/288 0.0%                       |
| embedding-coverage       | MAX_DEGENERATE_VECTORS |                  1 | 100/113 88.5%           | 0/288 0.0%                       |
| embedding-coverage       | MAX_DEGENERATE_VECTORS |                  5 | 77/113 68.1%            | 0/288 0.0%                       |
| embedding-coverage       | MAX_DEGENERATE_VECTORS |                 20 | 65/113 57.5%            | 0/288 0.0%                       |
