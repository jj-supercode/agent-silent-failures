---
id: ignored-worker-result
title: Ignored worker result
family: multi-agent
scope: run
status: experimental
requires:
    - tool_call 'agent-<key>' input.prompt
    - tool_call 'agent-<key>' output.text
    - tool_call.output (every returned tool value)
    - agent_run.output.text (the supervisor answer)
thresholds:
    - name: MAX_IGNORED_OVERLAP
      value: 0
      basis: 'strict: fires only when not one fact that only this worker contributed reaches the answer, trading catch rate for few false alarms'
      calibratedOn: prior
references:
    - title: 'Feature request: expose the sub-agent result and an optional verbatim relay, motivated by supervisors re-synthesizing replies (Mastra #21626)'
      url: https://github.com/mastra-ai/mastra/issues/21626
      date: 2026-08-16
    - title: 'Why Do Multi-Agent LLM Systems Fail? (MAST, arXiv 2503.13657)'
      url: https://arxiv.org/abs/2503.13657
      date: 2025-03-17
---

# Ignored worker result

**Experimental.** Lexical salience is a weak proxy for "used the result". Offline numbers come from a scripted
supervisor and will look better than a live model's paraphrases; read the known limits before relying on it.

## Symptom

A worker returns the facts. The supervisor answers something else, from its own prior, or keeps one worker's result
and replaces another's with a claim of its own. The answer is fluent and nothing in the run failed.

## Why no error is raised

Both agents finish normally and the delegation tool call succeeds. Nothing checks that the supervisor's answer is
grounded in what its workers returned.

## Trace signature

For a `tool_call 'agent-<key>'` span, none of the names, numbers or quoted words that only its reply contributed
appear in the root `agent_run` output, and that output asserts names, numbers or quoted words found in no prompt,
worker reply or tool result in the trace.

## Detector

Per supervisor run:

1. A reply's contributed facts are its salient tokens (name words, numbers, quoted words) minus every token the
   supervisor wrote into any of its prompts: echoing a subject the supervisor named is not using the result. A
   worker whose every tool call failed (thrown or an error-shaped result, the rule `swallowed-tool-error` uses)
   contributed nothing, whatever its reply says: a supervisor that then abstains, answers from another worker or its
   own tools, or labels a guess as unverified is not ignoring it. Tokens are spelled one way: a possessive is the
   name ("The Ring's" is "ring"), a lone capitalised word after a colon is an ordinary word, as at a sentence
   start ("The Ring: Probably yes"), and the start of a step Mastra glued to the one before without a space ("I'll
   retry once.Laurence Olivier ...") opens a sentence.
2. If no contributed fact of any reply reaches the supervisor's answer (overlap at most `MAX_IGNORED_OVERLAP`), every
   worker was ignored, however much their replies overlap.
3. Otherwise only replies with distinctive facts can be told apart: contributed facts that no different reply also
   reported. A reply is ignored when none of its distinctive facts reaches the answer.
4. The run fires when some reply is ignored and the answer has a salient token found in no prompt, reply or returned
   tool value. This second condition separates overriding a worker from summarising it away.

Severity is ignored replies over judged ones. A run where no reply contributed a fact, including one where every
worker failed, is `not-applicable`.

```ts
import { Mastra } from '@mastra/core/mastra';
import { ignoredWorkerResultScorer } from 'agent-silent-failures';

export const mastra = new Mastra({ scorers: { ignoredWorkerResult: ignoredWorkerResultScorer } });
```

## Thresholds and why

`MAX_IGNORED_OVERLAP = 0`: the strict value. It fires only when not one distinctive fact of a worker survives, which
keeps false alarms low at the cost of missing partial ignoring.

## Reproduction

Fault `supervisor-ignores-workers` (multi-agent harness). The supervisor delegates exactly like the clean one and
then answers from its prior. Severities: `answer-from-prior` (one confident claim about the first subject naming a
place and a year the corpus does not hold), `override-one-worker` (keeps the research on the first subject, replaces
the second subject with such a claim).

## Known false alarms

- A supervisor rightly rejecting a wrong worker result and answering from elsewhere: the detector cannot judge which
  side is right.
- Synonyms, abbreviations and transliterations ("US" versus "United States") hide a used fact.
- The recorded live run showed two more, both fixed as rules: failed workers counted as evidence, and spelling
  (possessives, a capital after a colon) read as invented facts. The README's "What the live run taught us" has the
  before and after on the same traces.

## Known misses

- Partial ignoring when replies overlap: one worker is overridden, but another reply also reported its facts (two
  researchers retrieving the same rows), so those facts reach the answer and the run reads as clear. Misses of this
  kind show under `override-one-worker` in Results.
- An answer that ignores the workers but asserts only words with no salient tokens ("Both were born there.").
- Replies and answers in scripts without capital letters (Japanese, Chinese): salient tokens need capitals or digits,
  so such a run is `not-applicable`, never fired.
- A live model's paraphrase that keeps no name or number verbatim.
- A worker that had a tool fail on every call but still reported facts from its own knowledge: its reply counts as
  no evidence, so a supervisor ignoring it is not judged.

## Credits

- Mastra #21626, a feature request for a verbatim relay of sub-agent results, is motivated by supervisors
  re-synthesising and sometimes distorting sub-agent replies.
- MAST (Cemri et al., arXiv 2503.13657): FM-2.5 ignored other agent's input and FM-2.6 reasoning-action mismatch.

## Results

<!-- docs-tables:results:start -->

Source: `scripted` (offline scripted model, local embeddings). Platform: darwin arm64, Node v24.22.0. Generated: 2026-10-15 (UTC). Versions: @mastra/core 1.77.0, @mastra/rag 2.6.7, @mastra/fastembed 1.3.3, @mastra/libsql 1.26.1.

- caught 46/48 = 95.8% [Wilson 95%: 86.0%, 98.8%]
    - supervisor-ignores-workers / answer-from-prior: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - supervisor-ignores-workers / override-one-worker: caught 22/24 = 91.7% [Wilson 95%: 74.2%, 97.7%]
- false alarms 0/152 = 0.0% [Wilson 95%: 0.0%, 2.5%; rule of three: 2.0%]
    - hard negative multi-agent-baseline: false alarms 0/118 = 0.0% [Wilson 95%: 0.0%, 3.2%; rule of three: 2.5%]
    - hard negative multi-agent-search-outage: false alarms 0/10 = 0.0% [Wilson 95%: 0.0%, 27.8%]
- Fires on no other entry's fault.
- Threshold sensitivity (one threshold at a time, the others at their defaults; caught over expressed runs):
    - `MAX_IGNORED_OVERLAP`: 0 (default): caught 46/48, false alarms 0/152; 0.1: caught 46/48, false alarms 0/152; 0.25: caught 46/48, false alarms 0/152; 0.5: caught 47/48, false alarms 0/152

Held-out families vary retrieval config, query phrasing, answer and abstention wording, and supervisor and worker wording, and the clean pool holds hard negatives; the faults themselves are our reproductions, so a high catch rate shows the detector matches them, not how often the failure occurs or is caught in the wild. Generated by `pnpm docs:tables` from `results/offline/report.json`.

<!-- docs-tables:results:end -->
