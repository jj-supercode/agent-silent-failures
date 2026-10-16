# How this was built

A snapshot of the build ledger, taken on 2026-10-16 when v0.1.0 was prepared for release.

## Process

The project was built by coding agents on Claude Opus 5.5, directed by the author. Every agent worked from a written
specification with its own file ownership, and no agent published anything.

- **Research before build.** Four research agents grounded the design in the installed Mastra source, prior art and
  the measurement method before any code was written.
- **Review.** Each build was reviewed against its specification and the coding principles, and what the review
  found was fixed.
- **A green gate per wave.** `pnpm check`, the demo, the bed, replay, the docs checks and Docker with
  `--network none --memory 1g` had to pass before the next wave started.
- **Three independent, read-only audits.** Code and design, claims and reproducibility, and a pre-release audit of
  the whole repository, each reproducing its findings from a fresh copy. Every major finding was fixed before
  release.
- **Real-model checks.** The live recording, the live demonstration and Studio sessions with Claude Haiku 5.5 found
  problems the scripted bed could not (parallel retries read as loops, citation labels on real streams), and those
  were fixed with tests that reproduce the real behaviour.

## Numbers

| Measure                             | Value                                 |
| ----------------------------------- | ------------------------------------- |
| Waves                               | 14                                    |
| Agents                              | 23 (4 research, 16 build, 3 audit)    |
| Elapsed time                        | about 36 hours over two days          |
| Summed agent working time           | about 29 hours                        |
| Defects found and fixed in review   | 350                                   |
| Findings raised by the three audits | 81 (every major fixed before release) |

Token use of the agents, by kind. Each turn re-reads the conversation so far, and those re-reads are served from the
prompt cache, so they dominate the count without dominating the cost:

| Token kind                                                               | Count        |
| ------------------------------------------------------------------------ | ------------ |
| Output tokens written                                                    | 11.7 million |
| Fresh input tokens                                                       | 7.4 million  |
| Cache writes (context stored for reuse)                                  | 27.4 million |
| Cache reads (context re-read each turn, billed at 5% of the input price) | 3.33 billion |

| Cost                                                                                                | USD     |
| --------------------------------------------------------------------------------------------------- | ------- |
| Agents, at list API prices for Claude Opus 5.5                                                      | 1,108   |
| Recorded runs with Claude Haiku 5.5 (the 408-run recording, the demonstrations and Studio sessions) | under 1 |

The recorded runs are the only model calls the published results depend on; everything else in this repository runs
offline.
