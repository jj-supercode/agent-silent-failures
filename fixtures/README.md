# Recorded traces

`pnpm replay` scores the traces in this folder offline, with the same detectors and the same scoring code as the
test bed. No model, network or API key is involved.

```
fixtures/
  live/<YYYY-MM-DD>/      a session with a real model (pnpm demo:live); numbers labelled `recorded`
  dry-run/<YYYY-MM-DD>/   the same pipeline driven by the scripted policies
                          (pnpm demo:live --dry-run --out fixtures/dry-run/<date>);
                          numbers labelled `scripted`, equal to the bed for the same runs
  demonstration/
    scripted/<YYYY-MM-DD>/  the Studio fault matrix, scripted (pnpm demonstration --write)
    live/<YYYY-MM-DD>/      the same matrix with a real model (pnpm demonstration:live)
```

Replay picks the newest `live/` set, or the newest `dry-run/` set while no live set exists. `pnpm replay --fixtures
<dir>` picks one explicitly. Results go to `results/replay/`.

## Files of one set

| File | What it holds |
|---|---|
| `manifest.json` | `schemaVersion`, mode, recording date and times, agent and judge model ids, platform, installed versions of the packages that shape a trace, sha256 of `data/hotpotqa/questions.jsonl`, planned / recorded / failed run counts, why the session stopped early (if it did), the kept span types |
| `runs.jsonl` | one line per run: its labels (run id, split, variation family, question id, replicate, seed, harness, condition, model source) and its outcome: the sanitized trace plus the optional judge verdict, or the reason the run failed |
| `spend.json` | what the recording cost (estimated, never billed, for a dry run), the cap, the pre-flight worst case, the prices with their source and read date, the per-call and per-run limits, and `retriedRuns` |

A failed run stays in `runs.jsonl` with its reason, so replay reports it instead of shrinking a denominator.

Two more cases are worth knowing:
- **Withheld runs.** A run whose line trips the sensitive-content scan is withheld: its line becomes a failed run whose reason names the kind of match, never the content.
- **Unfinished sessions.** The manifest and `spend.json` are rewritten after every run. While a session is running, `stoppedEarly` says it is unfinished, so a session that is interrupted or crashes still leaves a set replay can read, labelled as unfinished.

A live session refuses to start in a directory that already holds a recording.

### Sessions, retries and resumes

A recording can take more than one session: `pnpm demo:live --resume <dir>` re-runs a recording's failed and missing
runs into the same set. Three fields record that history. Sets written before they existed lack them, and replay
reads those sets unchanged (the fields are optional, so the schema version stays 1).

- **`manifest.json` `sessions[]`.** One entry per session, in order: `startedAt`, `finishedAt`, `recordedRuns` (runs
  this session wrote a line for), `failedRuns`, `retriedRuns` (runs that needed more than one attempt),
  `networkPaused` (milliseconds spent waiting for the network), `spentUsd`, `stoppedEarly` (why the session stopped,
  or `null`) and `platform`. The top-level provenance (`recordedOn`, `startedAt`, `platform`) stays the first
  session's; the top-level `recordedRuns` counts every line kept plus the new ones.
- **`spend.json` `retriedRuns`.** One entry per run that took more than one attempt: `runId`, `attempts`,
  `transientFailures` (the reason of each failed attempt) and `outcome` (`completed` or `failed`). Every attempt is
  paid from the same cap, and the spend figures add up over all sessions.
- **`runs.jsonl` after a resume.** Completed lines from earlier sessions come first, byte for byte, then the runs the
  resume recorded. The first resume keeps the previous file as `runs.jsonl.before-resume`, which is git-ignored and
  never part of a committed set.

`schemaVersion` is 1. Replay refuses any other version. A later version may only add fields, so a reader can be
widened without breaking committed sets.

## What a recorded trace keeps

The recorder stores the skeleton that run and ingestion views are built from, not the whole Mastra trace. The kept
span types are `agent_run`, `tool_call`, `mcp_tool_call`, `rag_ingestion` and `rag_action`. Every other span is
dropped, and each kept span is re-parented to its nearest kept ancestor. That preserves agent ownership,
delegation children, the single root and parent ids that point outside the trace. The dropped span types are
`model_generation`, `model_step`, `model_inference`, `model_chunk`, `processor_run` and `mapping`.

| Span type | Fields kept |
|---|---|
| every kept span | `traceId`, `spanId`, `parentSpanId` (re-parented), `name`, `spanType`, `entityId`, `startedAt`, `endedAt`, `isEvent` |
| `agent_run` | `output.text`; `attributes.maxSteps` when present |
| `tool_call`, `mcp_tool_call` | `input` (the tool arguments), `output` (the full tool result), `error.name` and `error.message` |
| `rag_ingestion` | `output` (the ingestion report) |
| `rag_action` | `attributes.action`, `strategy`, `chunkSize`, `chunkOverlap`; `output.chunkCount` |

Never kept:
- prompts and system instructions (`agent_run` input and attributes);
- the RequestContext snapshot Mastra stores on spans;
- span metadata, provider metadata and token usage;
- error stacks, which carry local file paths.

A test scans every committed fixture file (everything under `fixtures/` that git would stage) for API keys, email addresses,
home-directory paths and the values of secret-looking environment variables. The recorder runs the same scan on each line before writing it and withholds
any run that matches.

Replay checks that the corpus file still has the sha256 the manifest recorded. A set recorded on another corpus is
refused, because its gold answers and run labels would not match.

### What a new detector can and cannot use

It can use anything in a `RunView` or an `IngestionView`:
- agent runs and their answers;
- tool calls with arguments, results and thrown errors;
- retrieval rows with scores;
- delegations with prompts and worker replies;
- the ingestion report and chunking actions.

It cannot use:
- model inputs (the prompt, earlier messages, the tools offered to the model);
- per-step model output (text between tool calls, reasoning);
- token usage, timings of individual model calls;
- processor decisions.

A detector that needs any of these needs a new recording with a wider allowlist and a new `schemaVersion`.

## Demonstration recordings

`fixtures/demonstration/` holds the traces behind `results/demonstration/{scripted,live}.json`, in the same format and
with the same manifest as above. Each Studio fault preset writes one line per question it asks, or one line for the
session's corpus ingestion on an ingestion preset. A preset refused live (scripted-only) writes none.

- **Labels.** The run id is `studio/<preset>/<question id>` (or `studio/<preset>/ingestion`), the harness key is
  `studio/<preset>`, the family is `studio`, and the condition is the preset's catalog fault case. An ingestion line
  names the first demonstration question, since every line names one.
- **Mode.** `scripted` recordings say `dry-run` in the manifest, so their numbers are labelled `scripted`; live ones
  say `live` and are labelled `recorded`.
- **`spend.json`.** Live and dry-run recordings only: `{ "usd": ..., "modelCalls": ... }` from the Studio guard.
- **Scoring.** The reports are scored from these lines with replay's own per-run scoring, and checked against
  Studio's trace scoring of the full stored traces when they are recorded. `pnpm demonstration --rescore` scores the
  newest set of each kind again; `pnpm docs:tables` renders from them too.

## Regenerating

Rehearsals write nothing here: `pnpm demo:live --dry-run` and `pnpm demonstration` record to a fresh temporary
directory and print it (`pnpm replay --fixtures <dir>` scores a dry run). To replace a committed scripted set, ask
for it: `pnpm demo:live --dry-run --out fixtures/dry-run/<YYYY-MM-DD>` or `pnpm demonstration --write` (which also
rewrites `results/demonstration/scripted.json` and re-renders the docs). A live set needs an Anthropic API key in
`.env` and costs money; see the run modes section of the main README.

## What gets committed

- **Every live set the maintainer records** (`live/`, `demonstration/live/`): they are paid evidence, never
  overwritten, and the in-sample and out-of-sample readings in the README compare them.
- **One scripted set of each kind** (`dry-run/`, `demonstration/scripted/`): they are free to regenerate, so a new
  one replaces the old one in the same commit.
- **Nothing else.** Resume leftovers (`runs.jsonl.before-resume`, `runs.jsonl.rewriting`) are git-ignored.

The budget is 4 MiB for every fixture file a commit would hold, measured gzipped, since git stores each file
zlib-compressed and a clone pays that size. On 2026-10-15 the four committed sets held 9.8 MB of JSON, 1.7 MB
gzipped (the live set 1.0 MB, the dry-run set 0.7 MB, each demonstration set under 0.03 MB), which leaves room for
about two more live recordings. `src/record/committed-fixtures.test.ts` enforces it on the files `git add -A`
would stage, so a rehearsal outside the repository never counts.
