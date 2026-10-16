---
id: tool-loop
title: Tool loop
family: tool-use
scope: run
status: stable
requires:
    - tool_call.entityId
    - tool_call.input
    - tool_call.parentSpanId (to attribute each call to its nearest agent_run)
    - tool_call.startedAt
thresholds:
    - name: MIN_REPEATS
      value: 3
      basis: two similar calls are a plausible retry after a transient failure; three matches DeepEval AgentLoopDetectionMetric
      calibratedOn: prior
    - name: ARG_SIMILARITY
      value: 0.8
      basis: 'Jaccard of query terms: one added term at four or more terms passes (0.8), one substituted term at up to eight terms fails (0.6 to 0.78)'
      calibratedOn: prior
    - name: MIN_QUERY_TERMS
      value: 3
      basis: Jaccard is too coarse on one or two terms, so shorter queries must have identical terms to count as repeats
      calibratedOn: prior
    - name: MAX_RETRIES
      value: 2
      basis: a call re-issued after the same call failed is a retry; up to two retries in a row after an error is normal recovery, a third is not
      calibratedOn: prior
    - name: MIN_CYCLES
      value: 2
      basis: 'A-B-A-B: two full cycles of two different calls; at three cycles each call already repeats MIN_REPEATS times'
      calibratedOn: prior
references:
    - title: 'Tool call loop until maxStep reached (Mastra #14720)'
      url: https://github.com/mastra-ai/mastra/issues/14720
      date: 2026-03-26
    - title: 'Agent loop never sees the finish reason, every multi-step turn runs to maxSteps (Mastra #23746)'
      url: https://github.com/mastra-ai/mastra/issues/23746
      date: 2026-09-12
    - title: "TokenLimiter removes the current run's tool call and result, so the agent loops (Mastra #24110)"
      url: https://github.com/mastra-ai/mastra/issues/24110
      date: 2026-09-16
    - title: 'Near-identical SQL retried about six times (LangGraph #6731)'
      url: https://github.com/langchain-ai/langgraph/issues/6731
      date: 2026-01-30
    - title: 'Agent Loop Detection metric (DeepEval)'
      url: https://deepeval.com/docs/metrics-agent-loop-detection
      date: 2026-07-12
    - title: 'Trajectory accuracy scorer, noRedundantCalls (Mastra docs)'
      url: https://mastra.ai/reference/evals/trajectory-accuracy
      date: 2026-10-14
---

# Tool loop

## Symptom

The agent calls the same tool again and again with the same or trivially reworded arguments, or cycles between two
calls, and burns its step budget. The run ends with a partial or stale answer, or with no answer at all when the
budget runs out mid-loop.

## Why no error is raised

Every call succeeds and returns a normal result. Reaching `maxSteps` ends a Mastra run normally, so the trace shows a
completed run with an OK status and many healthy tool spans.

## Trace signature

Within one `agent_run`, several `tool_call` spans of the same tool whose inputs are equal after formatting
normalisation or whose single free-text argument has near-identical terms, differing only in ordinary words (a
changed name or number makes it a different call); or two different calls alternating
(A, B, A, B). Calls are attributed to their nearest `agent_run`, so a worker's calls never count for its supervisor.
A call that re-issues a call whose result was an error is a retry, not part of the signature, until the retries
exceed a budget.

## Detector

Per agent run, over its own tool calls (delegations to sub-agents are excluded, `delegation-ping-pong` owns them):

0. Retries are left out. A call is a retry when the most recent earlier call it matches (step 1) failed: it threw, or
   returned an error-shaped result (the same rule `swallowed-tool-error` uses). A streak of retries ends at the first
   usable result. A streak of at most `MAX_RETRIES` retries is left out; a longer streak counts in full, and so does
   every repeat after a usable result. An agent whose two parallel searches both fail and that re-issues both once
   (A, B, A, B) is retrying, not cycling.
1. Arguments are canonicalised: keys sorted, strings lower-cased with whitespace collapsed. Equal canonical arguments
   have similarity 1. Otherwise, when both argument objects have exactly one string field and are equal elsewhere,
   similarity is the Jaccard of that field's terms (lower-cased words, stopwords dropped, trailing plural `s`
   removed); if either side has fewer than `MIN_QUERY_TERMS` terms, only identical terms count. Terms that differ
   must be ordinary words: a changed name, number or quoted word makes the similarity 0. Anything else is 0, so a
   paginated call that changes only `page` is never a repeat.
2. Calls of one tool are clustered greedily in call order at `ARG_SIMILARITY`. The run fires when a cluster reaches
   `MIN_REPEATS`, adjacent or not.
3. Otherwise it fires on an alternation of two different calls lasting `MIN_CYCLES` full cycles.

Severity is (loop calls - 2) / (step budget - 2), clipped to [0, 1], with the budget never below the loop's own
length. Mastra 1.77 does not record `maxSteps` on `agent_run` spans, so the budget is the constant
`assumedStepBudget` (5, the default of Mastra's legacy agent loop) unless a trace from another framework carries one;
on Mastra traces any loop of five or more calls therefore has severity 1, whatever the real budget. The budget
scales severity only and never decides whether the entry fires, so it is not a threshold. A
run without own tool calls is `not-applicable`.

Register the scorer on your Mastra instance and score stored traces (Studio trace scoring or `scoreTraceBatch`):

```ts
import { Mastra } from '@mastra/core/mastra';
import { toolLoopScorer } from 'agent-silent-failures';

export const mastra = new Mastra({ scorers: { toolLoop: toolLoopScorer } /* agents, storage, observability */ });
```

## Thresholds and why

- `MIN_REPEATS = 3`: one retry after a transient failure is normal behaviour; a third call with the same arguments is
  not. DeepEval uses the same default for exact repeats.
- `ARG_SIMILARITY = 0.8`: case, punctuation, order and plurals are already absorbed by the term set, so the threshold
  only decides added and substituted words. Adding one word to a four-word query scores 0.8 (a repeat); substituting
  one word scores 0.6 at four words and 0.78 at eight (a refinement, for example "Ed Wood birth year" to "Ed Wood
  death year").
- `MIN_QUERY_TERMS = 3`: on one or two terms Jaccard jumps in steps of a third or a half, so short queries count only
  when their terms are identical.
- `MAX_RETRIES = 2`: a prior about agent behaviour, not a measured cut. Re-issuing a call that failed is normal
  recovery, and two retries in a row after an error is a common budget; a third retry of the same failing call is
  the start of a loop, so a streak of three retries counts in full (four calls, past `MIN_REPEATS`).
- `MIN_CYCLES = 2`: at three cycles every call of the cycle already repeats three times and step 2 fires anyway, so the
  cycle signal exists to catch the shorter A-B-A-B.

## Reproduction

Fault `repeated-search` (single-agent harness): the scripted model re-issues its search instead of answering.
Severities: `repeat-3` and `repeat-5` (the question with formatting noise: case, double spaces, a dropped question
mark), `repeat-until-step-budget` (never answers; the run ends at `maxSteps = 10`), `alternate-2-cycles` (two halves
of the question searched A, B, A, B), and `paraphrase-3` (each re-issue reorders the question and adds one
refinement word, so only the near-identical path can catch it). Every call succeeds, except under `retry-failing-5`:
the backend fails every search and the agent re-issues the same search five times, past the retry budget.

Hard negative `entity-swap/entity-swap-3` in the clean pool: the agent re-runs the question once per other candidate
source its first search returned, swapping that name in for the question's first named entity. Near-identical calls
about different entities are legitimate and must stay clear. Under a lower-cased question the hard negative has
no name to swap and makes a single search.

Hard negative `parallel-retry` in the clean pool, the pattern a real model showed in the recorded run: the agent
searches the two halves of the question as one round, both searches return an error payload, and it re-issues both
once (`first-round-fails`: the retries succeed; `every-search-fails`: they fail too and the agent abstains). Retries
of failed calls must stay clear.

## Known false alarms

- Legitimate polling of a status tool with unchanged arguments. The detector has no allowlist; score such agents with
  an override (`MIN_REPEATS`) or skip the scorer for them.
- A model that re-searches the same question on purpose after rows it judged insufficient, three times or more.

## Known misses

- Exact adjacent repeats are caught here too, but `noRedundantCalls` in `@mastra/evals` already covers them; this
  entry exists for what it misses: near-identical arguments, non-adjacent repeats and A-B-A-B cycles.
- A loop on a failing tool that stops within the retry budget (the first try and up to `MAX_RETRIES` retries)
  reads as recovery and stays clear.
- Loops whose arguments change a numeric field each time (for example an offset that keeps advancing over the same
  empty result) are treated as pagination and never fire.
- Paraphrased repeats that swap more than one word in five ("Ed Wood birth year" to "year Edward Wood was born").
- Repeats that change a name or number each time (the same question about three entities, or three years) are
  treated as different calls and never fire on the near-identical path; exact repeats still fire.

## Credits

- `@mastra/evals` `noRedundantCalls` flags exact adjacent repeats; this entry measures what lies beyond it.
- DeepEval `AgentLoopDetectionMetric` (exact repeats at a threshold of 3) set the `MIN_REPEATS` default.
- Mastra issues #14720, #23746 and #24110 document real loops; LangGraph #6731 shows near-identical retries.
- MAST (Cemri et al., arXiv 2503.13657) failure mode FM-1.3, step repetition.

## Results

<!-- docs-tables:results:start -->

Source: `scripted` (offline scripted model, local embeddings). Platform: darwin arm64, Node v24.22.0. Generated: 2026-10-15 (UTC). Versions: @mastra/core 1.77.0, @mastra/rag 2.6.7, @mastra/fastembed 1.3.3, @mastra/libsql 1.26.1.

- caught 144/144 = 100.0% [Wilson 95%: 97.4%, 100.0%]
    - repeated-search / repeat-3: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - repeated-search / repeat-5: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - repeated-search / repeat-until-step-budget: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - repeated-search / alternate-2-cycles: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - repeated-search / paraphrase-3: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - repeated-search / retry-failing-5: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/552 = 0.0% [Wilson 95%: 0.0%, 0.7%; rule of three: 0.5%]
    - hard negative multi-agent-baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - hard negative transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative multi-agent-transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative entity-swap/entity-swap-3: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative parallel-retry/first-round-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative parallel-retry/every-search-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
- Fires on no other entry's fault.
- Threshold sensitivity (one threshold at a time, the others at their defaults; caught over expressed runs):
    - `MIN_REPEATS`: 2: caught 144/144, false alarms 47/552; 3 (default): caught 144/144, false alarms 0/552; 4: caught 96/144, false alarms 0/552; 5: caught 96/144, false alarms 0/552; 6: caught 48/144, false alarms 0/552
    - `ARG_SIMILARITY`: 0.5: caught 144/144, false alarms 0/552; 0.6: caught 144/144, false alarms 0/552; 0.7: caught 144/144, false alarms 0/552; 0.8 (default): caught 144/144, false alarms 0/552; 0.9: caught 135/144, false alarms 0/552; 1: caught 120/144, false alarms 0/552
    - `MIN_QUERY_TERMS`: 1: caught 144/144, false alarms 0/552; 2: caught 144/144, false alarms 0/552; 3 (default): caught 144/144, false alarms 0/552; 5: caught 143/144, false alarms 0/552; 8: caught 137/144, false alarms 0/552
    - `MIN_CYCLES`: 1: caught 144/144, false alarms 162/552; 2 (default): caught 144/144, false alarms 0/552; 3: caught 120/144, false alarms 0/552
    - `MAX_RETRIES`: 0: caught 144/144, false alarms 48/552; 1: caught 144/144, false alarms 0/552; 2 (default): caught 144/144, false alarms 0/552; 3: caught 144/144, false alarms 0/552; 5: caught 120/144, false alarms 0/552

Held-out families vary retrieval config, query phrasing, answer and abstention wording, and supervisor and worker wording, and the clean pool holds hard negatives; the faults themselves are our reproductions, so a high catch rate shows the detector matches them, not how often the failure occurs or is caught in the wild. Generated by `pnpm docs:tables` from `results/offline/report.json`.

<!-- docs-tables:results:end -->
