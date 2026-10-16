# Findings in Mastra

Building this catalog meant reading a lot of Mastra traces and source. Along the way we found a few places where
Mastra itself fails silently, plus a few that look like bugs and are not. Each finding below has an offline script in
[`repros/`](../repros/README.md) that asserts the behaviour on the pinned versions: it exits 0 while the behaviour
reproduces and 10 once it is gone, so the list stays honest as Mastra moves.

Versions for every finding: `@mastra/core` 1.77.0, `@mastra/evals` 1.10.7, `@mastra/rag` 2.6.7, `@mastra/memory`
1.37.1, `@mastra/libsql` 1.26.1, `@mastra/fastembed` 1.3.3, `@mastra/observability` 1.20.0, `mastra` 1.34.1, `ai`
7.0.140, on Node 24 (each repro row below names the exact platform and Node version). No model provider is involved: the agents run on a scripted mock model and embeddings are
local. Source references are `path:line` in the `mastra-ai/mastra` repository at the release tag of the package
named.

Mastra moves fast, and every item here comes with a small, concrete fix. Each section names its status and links
the upstream issue once it exists.

## Reported

### 1. Two defaults disagree, silently: 4,000-character chunks and fastembed's 512-token window

**Status:** reported as [#27235](https://github.com/mastra-ai/mastra/issues/27235) on 2026-10-16; fixed by [#27315](https://github.com/mastra-ai/mastra/pull/27315) (merged, pending release). **Repros:** `pnpm repros fastembed-truncation`, `pnpm repros
fastembed-truncation-hotpotqa`, `pnpm repros memory-fastembed-truncation`.

Each piece behaves as designed. `@mastra/fastembed` initialises `bge-small-en-v1.5` with fastembed's default
`maxLength` of 512 tokens, the model's window, and the tokenizer truncates longer inputs
(`packages/fastembed/src/fastembed.ts:174,184,221`); truncating to the window is what upstream fastembed and
Sentence-Transformers do too. `MDocument.chunk()` defaults to 4,000 characters
(`packages/rag/src/document/transformers/text.ts:16-17`), which suits an embedder with a large input window such as
`openai/text-embedding-3-small`, the model Mastra's chunking and embedding docs use in their examples; Memory's
`chunkText` defaults to 4,096 tokens (`packages/memory/src/index.ts:1553-1555`).

The problem is the combination plus the silence. With `@mastra/fastembed` behind the default chunker, every chunk
longer than the window loses its tail: the tail's words never reach the vector, so a query about the tail finds
the chunk only through what its head says. `doEmbed` always returns `warnings: []`
(`packages/fastembed/src/index.ts:126-159`), nothing is logged, and the fastembed and semantic-recall docs do not
mention the window. Which documents are long enough depends on the text; the README headline gives the window in
characters of English prose, the length boundary on this repository's corpus, and the retrieval numbers, all
generated from these repros.

Suggested fix: no default needs to change. Count tokens before embedding (the tokenizer is already loaded) and
return a `warnings` entry for truncated inputs: the AI SDK already prints those from `embedMany` by default. Document
the window on the fastembed and semantic-recall pages; optionally let Memory size `chunkText` from the embedder's
window.

### 2. Trace scoring gives `type: 'agent'` scorers no tool calls

**Status:** reported as [#27236](https://github.com/mastra-ai/mastra/issues/27236) on 2026-10-16. **Repro:** `pnpm repros agent-scorer-loses-tool-calls`.

The custom-scorer docs recommend `type: 'agent'` for scorers that should work both live and on stored traces. On
traces, `reconstructToolInvocations` collects only direct `tool_call` children of the root `agent_run`
(`packages/core/src/evals/scoreTraces/utils.ts:199-210`), but stored traces nest every tool call under
`model_generation > model_step`. So the scorer always sees `toolInvocations: []` there. Mastra's own
`createToolCallAccuracyScorerCode({ expectedTool })` scores 1 on the live run and 0 on the stored trace of the same
run, with no error. Studio's `POST /api/observability/traces/score` route goes through the same code; a probe
against `mastra dev` 1.34.1 on 2026-10-14 persisted score 0 there too (checked by hand, not by the repro, which
calls `scoreTraceBatch`). Suggested
fix: walk the descendants of the root `agent_run`, stop at nested `agent_run` spans, order by `startedAt`. The
scorers in this repository load the stored trace themselves, which is why they are plain `createScorer` scorers
without a `type`.

### 3. `runEvals` scores the message trajectory, not the trace, even with storage configured

**Status:** reported as [#27237](https://github.com/mastra-ai/mastra/issues/27237) on 2026-10-16; fixed by [#27271](https://github.com/mastra-ai/mastra/pull/27271) (merged, pending release). **Repro:** `pnpm repros run-evals-trace-fallback`.

The trajectory-accuracy docs call trace-based extraction the preferred path when the target's Mastra instance has
storage. `runEvals` reads the trace once, right after `agent.generate()`
(`packages/core/src/evals/run/index.ts:1211-1230`, `:1318-1322`), while the default storage exporter still
buffers spans (`observability/mastra/src/exporters/mastra-storage.ts:106`). The read returns null, and trajectory
scorers silently receive the flat message trajectory instead, with `InMemoryStore` and `LibSQLStore` alike. With
`strategy: 'realtime'` the same code takes the trace path. Mastra's own score-recording path already retries this
read (`observability/mastra/src/default.ts:57,485`). Suggested fix: flush or retry the same way, and log when
falling back.

### 4. The redundant-call check never fires on trace-derived trajectories

**Status:** reported as [#27239](https://github.com/mastra-ai/mastra/issues/27239) on 2026-10-16; fix proposed in [#27316](https://github.com/mastra-ai/mastra/pull/27316). **Repro:** `pnpm repros redundant-calls-on-trace`.

`checkTrajectoryEfficiency({ noRedundantCalls: true })` compares each step with its immediately preceding sibling
(`packages/evals/src/scorers/utils.ts:1462-1489`, documented as "same tool + same args consecutively"). In a
trajectory from `extractTrajectoryFromTrace`, Mastra's own `processor_run` steps sit between every two `tool_call`
steps, so two consecutive identical calls are never adjacent: the message trajectory of a run flags them, the trace
trajectory of the same run does not. Non-adjacent repeats are outside the documented scope and not part of this
report. Suggested fix: compare each tool step with the previous tool step among its siblings.

### 5. Forbidden sequences and retry limits miss violations on trace-derived trajectories

**Status:** reported as [#27327](https://github.com/mastra-ai/mastra/issues/27327) on 2026-10-16. **Repro:** `pnpm repros trajectory-checks-on-trace`.

The same trace shape as finding 4, in two neighbouring checks that `createTrajectoryScorerCode` combines with it.
`checkTrajectoryBlacklist` matches `blacklistedSequences` against adjacent names in each sibling list
(`packages/evals/src/scorers/utils.ts`, `@mastra/evals` 1.10.7), so the `processor_run` steps between two tool calls
in a trace hide every forbidden sequence; a violation scores the whole trajectory 0, so this is the check users rely
on as a hard gate. `analyzeToolFailures` collects tool calls from the top-level steps only, while a trace nests every
tool call under `model_generation`, so `maxRetriesPerTool` sees no tool calls and finds no retries. Both checks
catch the violation on the message trajectory of the same run. Since `runEvals` reads the trace once it is stored
(#27237, fixed in #27271), both reach `runEvals` users by default. Suggested fix: skip non-tool steps when matching
sequences, as #27316 does for redundant calls, and collect tool calls from the whole trajectory for the retry
analysis.

### 6. Trajectory accuracy scores a correct run 0 on its trace trajectory

**Status:** reported as [#27329](https://github.com/mastra-ai/mastra/issues/27329) on 2026-10-16. **Repro:** `pnpm repros trajectory-accuracy-on-trace`.

The checks behind trajectory scoring read the top-level steps of a trajectory, and a trace-derived trajectory nests
every tool call under `model_generation`. `compareTrajectories` (which, by its own comment, does not recurse into
children) finds none of the expected steps in any ordering, so `createTrajectoryScorerCode` with expected steps scores
a run that makes exactly those calls 0 on its trace trajectory and 1 on its message trajectory; `maxSteps` counts one
step. With #27271 merged, `runEvals` passes trace trajectories once storage is configured: on a build of `main`
(`6889aa29`, 2026-10-16), the same run scored through `runEvals` went from 1 on `@mastra/core` 1.78.0 to 0 (checked
by hand, not by the repro). Findings 4 and 5 are the same mismatch in other checks. Suggested fix: one normalisation
that gives the flat checks a tool-level view of a trace trajectory (hoist the children of `model_generation`, drop
`processor_run`), so every check behaves the same on both shapes; token budgets keep reading `model_generation`.

## To be reported

### 7. `type: 'trajectory'` scorers throw under trace scoring

**Status:** not yet reported. **Repro:** `pnpm repros trajectory-scorer-trace-crash`.

`buildScorerRun` builds agent input only for `type: 'agent'` scorers and passes the raw root-span input and output
to every other type (`packages/core/src/evals/scoreTraces/scoreTracesWorkflow.ts:222,436-450`). A trajectory
scorer therefore receives the `agent_run` output instead of a `Trajectory` and fails on `run.output.steps`. This
one is not silent: the scorer run fails and the workflow logs the error. Studio's HTTP route still answered
"success" in a probe against `mastra dev` 1.34.1 on 2026-10-14 (checked by hand; the repro calls `scoreTraces`
directly). Suggested fix: pass `extractTrajectoryFromTrace(trace.spans, targetSpan.spanId)` to trajectory scorers,
as `runEvals` and live scoring already do.

### 8. Trace scoring failures are invisible when the trace is not stored yet

**Status:** not yet reported. **Repro:** `pnpm repros early-trace-scoring`.

Studio's trace-scoring route starts `scoreTraces` in the background and answers "Scoring started" (seen in a
probe against `mastra dev` 1.34.1 on 2026-10-14; the repro calls `scoreTraces` the way the route does). Per-target
failures such as `Trace not found for scoring` (`scoreTracesWorkflow.ts:194-197`, caught at `:71-88`) go only to
`logger.trackException`, which the default `ConsoleLogger` does not print
(`packages/_internal-core/src/logger/index.ts:368`, `adapter.ts:99`). Scoring a trace that is not stored yet
writes no score and prints nothing; the same call after a flush writes the score. Mostly reachable from scripts and
API callers. Suggested fix: also log at error level next to each `trackException`.

### 9. `createVectorQueryTool` turns a vector store error into an empty, successful result

**Status:** not yet reported. **Repro:** `pnpm repros vector-query-tool-swallows-store-errors`.

The tool's `execute` catches any error from the store and returns `{ relevantContext: [], sources: [] }`
(`packages/rag/src/tools/vector-query.ts:151-159`, `@mastra/rag` 2.6.7). Querying an index that does not exist
(`SQLITE_ERROR: no such table`) therefore reaches the agent as "no matches", and the `tool_call` span records a
success. The error is not lost everywhere: it is recorded on the nested `rag_vector_operation` span, and Mastra's
logger prints one `Unexpected error in VectorQueryTool execute` line. But the agent, the tool result, and any scorer
that reads tool calls all see an empty retrieval, which is exactly what the
[`empty-retrieval-answered`](../src/entries/empty-retrieval-answered/README.md) entry watches for. Separately,
`convertToSources` maps every score with `result.score || 0` (`packages/rag/src/utils/convert-sources.ts:19,29,38`),
so a missing or NaN score reads as a real score of 0. A related support thread (#5405, a store name that did not
resolve) shows users meeting the empty result. Suggested fix: rethrow store errors (or return a typed error
result the agent can see), and keep a missing score missing.

## Checked, not bugs

These looked like silent failures and are not. They are listed so nobody has to check them again.

- **Mismatched vector and metadata counts fail loudly.** Repro: `pnpm repros upsert-length-check`. When an
  embedder returns fewer vectors than inputs, `embedMany` (`ai` 7.0.140) throws `AI_InvalidResponseDataError`, and
  `LibSQLVector.upsert` with Mastra's documented `metadata: chunks.map(...)` throws `METADATA_LENGTH_MISMATCH`
  (`packages/core/src/vector/validation.ts:39-41`, called by `stores/libsql/src/vector/index.ts:381`). Both layers
  do the right thing. Rows are misattributed silently only when user code skips both checks: a hand-written
  embedding loop that pairs vectors with chunks by position and builds metadata from the vectors side. That is the
  pattern this catalog's `embed-batch-cap` fault reproduces, not Mastra's.
- **The `withRagIngestion` JSDoc example** does not compile and its `chunk` call throws loudly (repro
  `rag-ingestion-jsdoc`). Already known: PR #15199 fixed the example and was closed without merging.
- **Tool output that fails its own `outputSchema`** reaches the model as `{ error: true, message }` (repro
  `tool-output-validation-result`). This is the documented `outputValidation: 'strict'` default, with a console
  warning and `success: false` on the span. At the agent level it is the
  [`swallowed-tool-error`](../src/entries/swallowed-tool-error/README.md) pattern, which this catalog detects.
- **The RequestContext snapshot on spans** (repro `request-context-on-spans`) is by design (#14020), with key-name
  redaction shipped (#23055). Values under non-sensitive key names are stored verbatim, which is worth knowing
  before putting personal data in a RequestContext.

## Last repro run

<!-- docs-tables:repros:start -->

| Repro                                                                                                   | Last result | What it measured                                                                                                                                                                                                                                                                                            | Ran on                                         |
| ------------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------- |
| [`agent-scorer-loses-tool-calls`](../repros/agent-scorer-loses-tool-calls/repro.ts)                     | reproduces  | type 'agent' scorer: 2 tool calls live, 0 when scoring the stored trace that holds 2 tool_call spans                                                                                                                                                                                                        | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`early-trace-scoring`](../repros/early-trace-scoring/repro.ts)                                         | reproduces  | scoring before the trace is stored resolves, writes 0 scores and prints 0 console lines; the same call after a flush writes 1                                                                                                                                                                               | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`fastembed-truncation-hotpotqa`](../repros/fastembed-truncation-hotpotqa/repro.ts)                     | reproduces  | question-level documents: 58/77 default chunks exceed the 512-token window (27.80% of tokens never embedded); per-paragraph documents: 0/386                                                                                                                                                                | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`fastembed-truncation`](../repros/fastembed-truncation/repro.ts)                                       | reproduces  | 249/249 default chunks exceed fastembed's 512-token window; 36.01% of corpus characters are never embedded; top-5 hit rate for sentences in chunk tails is 0.3083 (95% CI 0.2327 to 0.3958, n=120) vs 0.6917 (95% CI 0.6042 to 0.7673, n=120) for chunk heads, no warning raised                            | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`memory-fastembed-truncation`](../repros/memory-fastembed-truncation/repro.ts)                         | reproduces  | semantic recall (topK 3) finds the message for 0.8205 (95% CI 0.6733 to 0.9102, n=39) of sentences from its first 512 tokens but 0.3684 (95% CI 0.2338 to 0.5272, n=38) of sentences after them                                                                                                             | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`rag-ingestion-jsdoc`](../repros/rag-ingestion-jsdoc/repro.ts)                                         | reproduces  | JSDoc example has 4 type errors; its chunk call threw: Invalid parameters for recursive strategy: 'observabilityContext' not supported; its upsert call is accepted and emits 0 vector-operation spans                                                                                                      | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`redundant-calls-on-trace`](../repros/redundant-calls-on-trace/repro.ts)                               | reproduces  | two consecutive identical searchCorpus calls: redundantCalls has 1 entry on the message trajectory, 0 on the trace trajectory of the same run                                                                                                                                                               | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`request-context-on-spans`](../repros/request-context-on-spans/repro.ts)                               | reproduces  | 4/21 stored spans carry the RequestContext; keys stored verbatim despite the default sensitive-data filter: customerEmail, tenantDatabaseUrl                                                                                                                                                                | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`run-evals-trace-fallback`](../repros/run-evals-trace-fallback/repro.ts)                               | reproduces  | default exporter: runEvals used the message-fallback trajectory although the trace exists once flushed; with strategy 'realtime' it used the trace trajectory; LibSQLStore with the default exporter: message-fallback                                                                                      | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`tool-output-validation-result`](../repros/tool-output-validation-result/repro.ts)                     | reproduces  | tool output failing outputSchema reached the model as a tool result; generate() returned text "The document scored well." and 1 console lines                                                                                                                                                               | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`trajectory-accuracy-on-trace`](../repros/trajectory-accuracy-on-trace/repro.ts)                       | reproduces  | a run making exactly the expected searchCorpus, lookupSource calls: createTrajectoryScorerCode scores 1 on the message trajectory and 0 on the trace trajectory (accuracy 0 in every ordering); maxSteps 1 counts 2 steps on messages, 1 on the trace                                                       | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-16 |
| [`trajectory-checks-on-trace`](../repros/trajectory-checks-on-trace/repro.ts)                           | reproduces  | blacklistedSequences [searchCorpus, lookupSource]: score 0 on the message trajectory, 1 on the trace trajectory of the same run; a retry after a failed flakySearch call with maxRetriesPerTool 0: 1 retry found on the message trajectory, 0 on the trace trajectory                                       | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-16 |
| [`trajectory-scorer-trace-crash`](../repros/trajectory-scorer-trace-crash/repro.ts)                     | reproduces  | type 'trajectory' scorer under trace scoring: Scorer Run Failed: Cannot read properties of undefined (reading 'map'); the same scorer on extractTrajectoryFromTrace(spans) scores 1                                                                                                                         | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`upsert-length-check`](../repros/upsert-length-check/repro.ts)                                         | reproduces  | an embedder returning 3 vectors for 4 inputs: embedMany threw AI_InvalidResponseDataError; the documented upsert (metadata from chunks) threw MASTRA_VECTOR_LIBSQL_UPSERT_FAILED caused by MASTRA_VECTOR_LIBSQL_UPSERT_METADATA_LENGTH_MISMATCH; only a positional zip (metadata from the vectors) resolved | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |
| [`vector-query-tool-swallows-store-errors`](../repros/vector-query-tool-swallows-store-errors/repro.ts) | reproduces  | querying a missing index returned 0 sources with no error on the tool_call span (error only on the nested rag_vector_operation span); NaN scores came back as 0, 0                                                                                                                                          | darwin 25.6.0 arm64, Node v24.22.0, 2026-10-15 |

<!-- docs-tables:repros:end -->
