---
id: delegation-ping-pong
title: Delegation ping-pong
family: multi-agent
scope: run
status: stable
requires:
    - tool_call 'agent-<key>' input.prompt
    - tool_call 'agent-<key>' output.text
    - tool_call.parentSpanId (to attribute each delegation to its supervisor agent_run)
    - tool_call.startedAt
thresholds:
    - name: MIN_REDELEGATIONS
      value: 3
      basis: one re-delegation is a plausible retry of an empty reply; a third send of the same task is not
      calibratedOn: prior
    - name: PROMPT_SIMILARITY
      value: 0.8
      basis: Jaccard of prompt terms, applied only to prompts naming the same salient tokens equally often, so it absorbs rewording and never an entity swap
      calibratedOn: prior
    - name: WORKER_TEXT_SIMILARITY
      value: 0.9
      basis: 'Jaccard of the facts two replies name (names, numbers, quoted words), so rewording is no change; at 0.9 a reply adding one new fact to ten counts as unchanged, two do not'
      calibratedOn: prior
    - name: MIN_BOUNCE_LENGTH
      value: 4
      basis: 'A-B-A-B: two full rounds between two workers with no new information'
      calibratedOn: prior
references:
    - title: "The supervisor doesn't acknowledge the return and calls the subagent again (langgraph-supervisor-py #208)"
      url: https://github.com/langchain-ai/langgraph-supervisor-py/issues/208
      date: 2025-07-14
    - title: 'The same request delegated to the same agent until the turn limit (CrewAI #3899)'
      url: https://github.com/crewAIInc/crewAI/issues/3899
      date: 2025-11-12
    - title: 'Agents network loop (Mastra #9314)'
      url: https://github.com/mastra-ai/mastra/issues/9314
      date: 2025-10-27
    - title: 'agent.network goes into an infinite loop when the prompt does not involve an agent (Mastra #8223)'
      url: https://github.com/mastra-ai/mastra/issues/8223
      date: 2025-09-26
    - title: 'Why Do Multi-Agent LLM Systems Fail? (MAST, arXiv 2503.13657)'
      url: https://arxiv.org/abs/2503.13657
      date: 2025-03-17
    - title: 'Subagents (Mastra docs)'
      url: https://mastra.ai/docs/subagents
      date: 2026-10-14
---

# Delegation ping-pong

## Symptom

A supervisor keeps handing the same task back to a worker, or bounces one subject between two workers, as if the
work had never come back. The run ends at its step budget, or with an answer built from the last reply only, after
paying for every repeated sub-agent run.

## Why no error is raised

Each delegation is a successful tool call (`agent-<key>`) that runs a sub-agent to completion. Repeating it is just
more successful calls, and the run ends normally at a step or turn limit.

## Trace signature

Under one supervisor `agent_run`, the `tool_call 'agent-<key>'` spans show the same worker receiving prompts with the
same salient tokens and near-identical wording, or an alternation between two workers whose replies
(`output.text`) do not change.

## Detector

Per supervisor run, over its delegations in start order:

1. Same task: same worker, the same salient tokens (name words, numbers, quoted words) occurring equally often, and
   prompt terms with Jaccard at least `PROMPT_SIMILARITY`. Delegations are clustered greedily; the run fires when a
   cluster reaches `MIN_REDELEGATIONS`.
2. Bounce: consecutive delegations switch workers, each goes back to the worker two places before, and that
   worker's reply names the same facts (names, numbers, quoted words) within `WORKER_TEXT_SIMILARITY`. Replies that
   name no fact at all compare on their content words instead, so "Confirmed." and "Yes, that is correct." are
   different replies. The run fires at `MIN_BOUNCE_LENGTH`.

Severity is redundant delegations (all but the first of a repeated task, all but the first round of a bounce) over the
supervisor's delegations. A run without delegations is `not-applicable`.

Comparing salient-token counts, not sets, matters: a prompt that quotes the user question ("Look up Ed Wood for this
question: were Scott Derrickson and Ed Wood ...") names both subjects, so its salient set equals the set of the same
prompt about Scott Derrickson, and its Jaccard is 0.9. Counts tell them apart (Ed Wood is named twice in one, once in
the other). A look at the output distribution of clean runs found this: with sets, two legitimate retries per
subject fired on clean runs.

```ts
import { Mastra } from '@mastra/core/mastra';
import { delegationPingPongScorer } from 'agent-silent-failures';

export const mastra = new Mastra({ scorers: { delegationPingPong: delegationPingPongScorer } });
```

## Thresholds and why

- `MIN_REDELEGATIONS = 3`: a supervisor may legitimately re-delegate once after an empty or abstaining reply.
- `PROMPT_SIMILARITY = 0.8`: only applied when the salient tokens match, so it absorbs rewording ("Please find ..."
  versus "Find ...") and never a different subject. A comparison task that asks the same worker about two entities
  is never a repeat, however long the shared wording.
- `WORKER_TEXT_SIMILARITY = 0.9`: replies are compared on the facts they name, so rewording is no change; at 0.9 a
  reply that adds one new fact to ten counts as unchanged, and one that adds two does not.
- `MIN_BOUNCE_LENGTH = 4`: two full rounds between the same two workers.

## Reproduction

Fault `supervisor-no-ack` (multi-agent harness: a supervisor with a `researcher` and a `checker` registered under
`agents: {}`). The supervisor ignores returned work; workers stay clean. Severities: `redelegate-3`, `redelegate-4`,
`redelegate-6` (the first subject's research task sent again, alternating two wordings), `bounce-2-rounds`
(researcher, checker, researcher, checker on the same subject with unchanged prompts).

## Known false alarms

- Writer and critic loops where the prompt changes only slightly between rounds while the draft improves: the prompts
  repeat, the replies change. Signal 1 can fire on three or more such rounds.
- A deliberate fan-out of the same task to one worker for self-consistency voting.
- Prompts that quote a question naming every subject: an entity swap then keeps all terms (Jaccard 1.0 in the shape
  check) and only the count of subject mentions tells the tasks apart. A live model that names both subjects equally
  often in each prompt would read as one task.

## Known misses

- A repeated task phrased with a different salient token each time (for example a changing date or id in the prompt).
- A bounce whose replies keep the same names and numbers but change ordinary words (a reworded verdict) counts as
  unchanged; one that adds a second new fact in ten does not.
- Ping-pong through Mastra's deprecated `.network()` is out of scope; the detector reads supervisor delegations.

## Credits

- langgraph-supervisor-py #208 and CrewAI #3899 report supervisors re-delegating returned work; Mastra #9314 and
  #8223 report loops in the deprecated agent network.
- AgentTelemetry's `circular_delegation` fault and rule detector (https://github.com/Krishnachaitanyakc/AgentTelemetry)
  is prior art for measuring this failure on injected faults.
- MAST (Cemri et al., arXiv 2503.13657): FM-1.3 step repetition and FM-1.5 unaware of termination conditions.

## Results

<!-- docs-tables:results:start -->

Source: `scripted` (offline scripted model, local embeddings). Platform: darwin arm64, Node v24.22.0. Generated: 2026-10-15 (UTC). Versions: @mastra/core 1.77.0, @mastra/rag 2.6.7, @mastra/fastembed 1.3.3, @mastra/libsql 1.26.1.

- caught 96/96 = 100.0% [Wilson 95%: 96.2%, 100.0%]
    - supervisor-no-ack / redelegate-3: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - supervisor-no-ack / redelegate-4: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - supervisor-no-ack / redelegate-6: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - supervisor-no-ack / bounce-2-rounds: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/168 = 0.0% [Wilson 95%: 0.0%, 2.2%; rule of three: 1.8%]
    - hard negative multi-agent-baseline: false alarms 0/120 = 0.0% [Wilson 95%: 0.0%, 3.1%; rule of three: 2.5%]
    - hard negative multi-agent-transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative multi-agent-search-outage: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
- Fires on no other entry's fault.
- Threshold sensitivity (one threshold at a time, the others at their defaults; caught over expressed runs):
    - `MIN_REDELEGATIONS`: 2: caught 96/96, false alarms 22/168; 3 (default): caught 96/96, false alarms 0/168; 4: caught 72/96, false alarms 0/168; 5: caught 48/96, false alarms 0/168; 7: caught 24/96, false alarms 0/168
    - `PROMPT_SIMILARITY`: 0.5: caught 96/96, false alarms 0/168; 0.6: caught 96/96, false alarms 0/168; 0.7: caught 96/96, false alarms 0/168; 0.8 (default): caught 96/96, false alarms 0/168; 0.9: caught 78/96, false alarms 0/168; 1: caught 48/96, false alarms 0/168
    - `WORKER_TEXT_SIMILARITY`: 0.5: caught 96/96, false alarms 0/168; 0.7: caught 96/96, false alarms 0/168; 0.8: caught 96/96, false alarms 0/168; 0.9 (default): caught 96/96, false alarms 0/168; 1: caught 96/96, false alarms 0/168
    - `MIN_BOUNCE_LENGTH`: 3: caught 96/96, false alarms 0/168; 4 (default): caught 96/96, false alarms 0/168; 5: caught 72/96, false alarms 0/168; 6: caught 72/96, false alarms 0/168

Held-out families vary retrieval config, query phrasing, answer and abstention wording, and supervisor and worker wording, and the clean pool holds hard negatives; the faults themselves are our reproductions, so a high catch rate shows the detector matches them, not how often the failure occurs or is caught in the wild. Generated by `pnpm docs:tables` from `results/offline/report.json`.

<!-- docs-tables:results:end -->
