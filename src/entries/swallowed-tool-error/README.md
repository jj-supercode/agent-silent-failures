---
id: swallowed-tool-error
title: Swallowed tool error
family: tool-use
scope: run
status: stable
requires:
    - tool_call.entityId
    - tool_call.output (error-shaped results)
    - tool_call.error (thrown tools)
    - tool_call.parentSpanId (to attribute each call to its nearest agent_run)
    - agent_run.output.text
thresholds: []
references:
    - title: 'Tools: error handling, "Reported in tool results with isError: true" (Model Context Protocol, 2025-06-18)'
      url: https://modelcontextprotocol.io/specification/2025-06-18/server/tools
      date: 2025-06-18
    - title: 'Tools: default_tool_error_function tells the LLM an error occurred (OpenAI Agents SDK)'
      url: https://openai.github.io/openai-agents-python/tools/
      date: 2026-10-14
    - title: 'Error-processor retries are silently dropped when a run is out of steps (Mastra #25757)'
      url: https://github.com/mastra-ai/mastra/issues/25757
      date: 2026-10-02
    - title: 'Tool exceptions are caught and replaced with generic error messages (CrewAI #6262)'
      url: https://github.com/crewAIInc/crewAI/issues/6262
      date: 2026-06-20
---

# Swallowed tool error

## Symptom

A tool failed, returned the failure as an ordinary result, and the agent answered as if the call had worked. The
answer is fluent and confident; it is built from the model's prior or from an earlier, partial result.

## Why no error is raised

Error-as-result is the documented convention in several stacks. MCP reports tool errors "in tool results with
`isError: true`"; the OpenAI Agents SDK's default tool error function turns an exception into a message for the
model; Mastra hands the model `{ error: true, message }` when a tool's return value fails its own output schema. The
run never throws, so nothing upstream sees a failure.

## Trace signature

A `tool_call` span whose output has an error shape, or that carries a thrown error; no later call to the same tool by the same `agent_run`
succeeded; and that agent run's output text neither abstains nor admits the failure.

## Detector

Per agent run, over its own tool calls: a call failed when it threw or returned an error shape. An error is a
thrown call, MCP's `isError: true`, a top-level `error` that is `true`, a non-empty message or an object with a
`message`, or `success: false` together with a `message`. `{ success: false, reason: 'already booked' }` and
`{ error: { code: 0 } }` are business answers, not errors. A failure is
unrecovered when no later call to the same tool by the same run returned a non-error result. The run fires when an
agent run with an unrecovered failure produced non-empty output text that does not match the shared abstention and
failure-acknowledgement phrases of `src/text/abstention.ts`. A phrase needs a subject (I or we, the sentence start,
or the material searched: the corpus, documents, passages, context, sources, search results, knowledge base) or is
a fixed idiom; the sets cover contractions ("wasn't able to", "I'm unable to"), "don't have any information", "no
mention", "the search returned no results", "not covered in the documents", "cannot reliably answer", failure
admissions ("the search tool failed", "an error occurred"), and basic German, French and Spanish forms. The committed
test set in `src/text/abstention.test.ts` lists the phrasings matched, the near-misses that must not match, and the
known misses. Each agent judges its own calls, so a worker
that swallowed an error is caught even when its supervisor's answer reads well.

Severity is unrecovered failures over the tool calls of the agent runs that swallowed them. A run without tool calls
is `not-applicable`.

```ts
import { Mastra } from '@mastra/core/mastra';
import { swallowedToolErrorScorer } from 'agent-silent-failures';

export const mastra = new Mastra({ scorers: { swallowedToolError: swallowedToolErrorScorer } });
```

An agent with its own way of admitting a failure gets a scorer that knows the wording:

```ts
import { Mastra } from '@mastra/core/mastra';
import { createSwallowedToolErrorScorer } from 'agent-silent-failures';

// This agent says "the catalogue is offline" when its lookup tool fails.
export const mastra = new Mastra({
    scorers: {
        swallowedToolError: createSwallowedToolErrorScorer({
            extraAcknowledgementPatterns: [{ name: 'catalogue offline', pattern: /\bcatalogue is offline\b/ }],
        }),
    },
});
```

## Thresholds and why

None. Any unrecovered, unacknowledged failure fires: there is no level of swallowed errors that is fine. The
judgement lives in the phrase sets of `src/text/abstention.ts`, which are named and documented so an application can
add its own wording.

Compared with `checks.noToolErrors` in `@mastra/evals`: that check scores any error, recovered or not, and is an
agent-typed scorer, which sees no tool calls under trace scoring. This entry reads the span tree and flags only
failures that were neither recovered nor acknowledged.

## Reproduction

Fault `swallowed-search-error` (single-agent harness): `searchCorpus` returns
`{ error: 'upstream 503: search backend unavailable' }` and the scripted model proceeds. Severities:
`answer-without-retry` (the first call fails, the model answers from its prior), `retry-then-answer` (every call
fails, one retry, then an answer from its prior), `refinement-failed` (the first search succeeds, its refinement
fails, the model answers from the first rows as if the refinement had worked).

## Known false alarms

- An acknowledgement phrased outside the phrase sets ("the lookup came back empty-handed"). Add the agent's own
  wording through `extraAcknowledgementPatterns` (example under Detector), or extend the shared sets in
  `src/text/abstention.ts`.
- A fallback to a different tool that succeeded: the failed tool itself was never recovered, so it fires.
- A failure on a call whose result did not matter for the answer.

## Known misses

- An error the tool reports in free text inside a normal-looking result ("Sorry, no data: upstream timeout").
- An answer that mentions the failure in passing and still asserts unsupported facts: any acknowledgement clears it.
- An agent that answers with an empty string after a failure is not judged as answering.

## Credits

- The Model Context Protocol tools specification and the OpenAI Agents SDK tool error default document
  error-as-result by design.
- Mastra #25757 and CrewAI #6262 report errors that reach users as ordinary results.
- `@mastra/evals` `checks.noToolErrors` is the closest shipped check; the difference is described above.

## Results

<!-- docs-tables:results:start -->

Source: `scripted` (offline scripted model, local embeddings). Platform: darwin arm64, Node v24.22.0. Generated: 2026-10-15 (UTC). Versions: @mastra/core 1.77.0, @mastra/rag 2.6.7, @mastra/fastembed 1.3.3, @mastra/libsql 1.26.1.

- caught 72/72 = 100.0% [Wilson 95%: 94.9%, 100.0%]
    - swallowed-search-error / answer-without-retry: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - swallowed-search-error / retry-then-answer: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
    - swallowed-search-error / refinement-failed: caught 24/24 = 100.0% [Wilson 95%: 86.2%, 100.0%]
- false alarms 0/552 = 0.0% [Wilson 95%: 0.0%, 0.7%; rule of three: 0.5%]
    - hard negative transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative search-outage: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative multi-agent-transient-search-error: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative multi-agent-search-outage: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative parallel-retry/first-round-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
    - hard negative parallel-retry/every-search-fails: false alarms 0/24 = 0.0% [Wilson 95%: 0.0%, 13.8%]
- Fires on no other entry's fault.

Held-out families vary retrieval config, query phrasing, answer and abstention wording, and supervisor and worker wording, and the clean pool holds hard negatives; the faults themselves are our reproductions, so a high catch rate shows the detector matches them, not how often the failure occurs or is caught in the wild. Generated by `pnpm docs:tables` from `results/offline/report.json`.

<!-- docs-tables:results:end -->
