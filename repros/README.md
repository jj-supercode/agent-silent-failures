# Repros

Minimal, offline reproductions of the behaviours described in
[`docs/findings-in-mastra.md`](../docs/findings-in-mastra.md). Each folder holds one `repro.ts` that builds the
smallest Mastra setup showing the behaviour, asserts it, and writes a JSON report to `results/repros/<id>.json`.

```sh
pnpm repros                          # every repro, then a result table (4 to 7 minutes, mostly fastembed-truncation)
pnpm repros early-trace-scoring      # one or more by id
```

Exit codes of each script:

| Code  | Meaning                                                       |
| ----- | ------------------------------------------------------------- |
| 0     | the behaviour still reproduces on the installed versions      |
| 10    | it no longer reproduces: likely changed upstream, re-check it |
| other | the repro itself broke                                        |

`pnpm repros` exits 0 only when every selected repro exits 0, 1 otherwise, and 2 for an unknown id. `--json` and
`--plain` work as for every command (see "For agents and CI" in the top-level README). It is not part of
`pnpm check`: these scripts watch Mastra, not this repository's code.

| Folder                                    | Finding                                                                      |
| ----------------------------------------- | ---------------------------------------------------------------------------- |
| `fastembed-truncation`                    | fastembed's 512-token window against default 4,000-character chunks (book)   |
| `fastembed-truncation-hotpotqa`           | the same on this repository's HotpotQA documents, by document length         |
| `memory-fastembed-truncation`             | the same through Memory semantic recall                                      |
| `agent-scorer-loses-tool-calls`           | `type: 'agent'` scorers see no tool calls under trace scoring                |
| `run-evals-trace-fallback`                | `runEvals` uses the message trajectory although storage is configured        |
| `redundant-calls-on-trace`                | the redundant-call check misses consecutive repeats on trace trajectories    |
| `trajectory-checks-on-trace`              | forbidden sequences and retry limits miss violations on trace trajectories   |
| `trajectory-scorer-trace-crash`           | `type: 'trajectory'` scorers throw under trace scoring                       |
| `early-trace-scoring`                     | scoring a trace before it is stored writes nothing and prints nothing        |
| `vector-query-tool-swallows-store-errors` | `createVectorQueryTool` returns an empty result on a store error; NaN to 0   |
| `upsert-length-check`                     | checked, not a bug: count mismatches fail loudly in `embedMany` and `upsert` |
| `rag-ingestion-jsdoc`                     | checked, already known upstream: the `withRagIngestion` JSDoc example        |
| `tool-output-validation-result`           | checked, by design: a failed `outputSchema` reaches the model as a result    |
| `request-context-on-spans`                | checked, by design: the RequestContext snapshot stored on spans              |

For the "checked" rows, exit 0 means the recorded behaviour still holds, not that it is a bug.

## How they run

- **Offline.** Agents use a scripted `MockLanguageModelV4` (`shared/scripted-model.ts`); embeddings come from
  `@mastra/fastembed`, which downloads `bge-small-en-v1.5` once into `~/.cache/mastra/fastembed-models` (the same
  cache `pnpm demo` uses). The runner passes an empty `ANTHROPIC_API_KEY` to every child process and never loads
  `.env`.
- **Same versions as the package.** The repros use the repository's own exact pins, so a Mastra upgrade there is
  re-checked here. `@mastra/evals` and `@mastra/memory` are development dependencies only for these scripts.
  `@mastra/evals` 1.10.7 declares a `vitest <5` peer range; it is not used with Vitest here, so pnpm's peer warning
  is expected.
- **Corpus.** `corpus/origin-of-species.txt` is Project Gutenberg eBook #1228, redistributed unchanged with its
  licence; see `corpus/SOURCE.md`. The HotpotQA repro reads `data/hotpotqa/` through `src/corpus`.
- **Fixtures.** `rag-ingestion-jsdoc/fixtures/` holds an upstream JSDoc example that is meant not to compile, so it
  is excluded from type checking, linting and formatting.
- **Shared code.** `runner/` finds and runs the repros for `pnpm repros`; `shared/` holds the scripted model, a
  two-tool agent, observed storage and the report writer; `embedding-window/` holds the exact fastembed tokenizer,
  the corpus loader, chunk measurement and retrieval probes for the truncation repros. Wilson intervals come from
  the test bed's own `wilsonInterval`, so a repro and the bed never disagree on an interval.
