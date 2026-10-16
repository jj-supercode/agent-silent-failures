---
id: my-failure
title: My failure
family: rag
scope: run
status: experimental
requires:
    - tool_call.output.hits[].score
thresholds:
    - name: MIN_SOMETHING
      value: 3
      basis: one sentence a reviewer can check, for example a property of correct runs or a published value
      calibratedOn: prior
references:
    - title: 'Where this failure or its signal was described before'
      url: https://example.org/prior-work
      date: 2026-10-14
---

# My failure

Copy this folder's page to `src/entries/<id>/README.md` and replace every paragraph. Keep the headings and their
order; a test checks them. See CONTRIBUTING.md for the code files that sit next to it.

## Symptom

What a user or an operator sees. One short paragraph: the output looks fine, and what is actually wrong.

## Why no error is raised

Which component swallows the problem and why nothing throws, logs or alerts.

## Trace signature

Which spans and fields show it in a stored Mastra trace (`agent_run`, `tool_call` input and output, `rag_ingestion`
output), and what they look like on a faulted run compared with a clean one.

## Detector

The rule, in words and in terms of `RunView` / `IngestionView` fields. When it fires, when it is clear, when it is
not applicable, and how severity (0..1) is computed.

## Thresholds and why

Each threshold, its value and its basis. Say whether it is an invariant, a prior or tuned on dev.

## Reproduction

| Fault      | Severity         | Mechanism              | Harness      |
| ---------- | ---------------- | ---------------------- | ------------ |
| `fault-id` | `mild`, `severe` | what the fault changes | single-agent |

The hard negatives in the clean pool that tempt this detector, and why they are correct runs.

## Known false alarms

Correct runs this detector can flag, and how to tell them apart from the failure.

## Known misses

Variants of the failure this detector does not catch, with the reason.

## Credits

Prior work this entry builds on, and what it adds.

## Results

<!-- docs-tables:results:start -->
<!-- docs-tables:results:end -->
