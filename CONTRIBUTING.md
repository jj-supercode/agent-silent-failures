# Contributing

Thanks for helping. The most valuable contributions are new catalog entries, false-alarm reports from real traces,
and better reproductions of existing failures. Bug fixes and docs fixes are welcome too.

Before a larger change, open an issue: **New entry proposal** for a failure you can reproduce, **Wanted entry** for
one you have seen but cannot reproduce yet, **False alarm** for a canary that fired on a run that was fine.

## Set up

```sh
corepack enable        # picks the pinned pnpm
pnpm install
pnpm check             # must pass before and after your change
pnpm demo              # offline bed summary; the first run downloads the embedding model
```

Nothing here needs an API key. Tests, the demo, the bed, replay and the repros all run offline on a scripted model
and local embeddings. Never commit a `.env`.

## Add an entry in an afternoon

An entry is one folder under `src/entries/<id>/`, where `<id>` is short kebab case naming the failure, not the fix
(`tool-loop`, not `loop-guard`). Copy [`docs/entry-template/`](docs/entry-template/README.md) as a start.

```
src/entries/<id>/
  README.md                 the catalog page (frontmatter + fixed sections, below)
  model.ts                  the thresholds (`as const satisfies Thresholds`) and any entry-local types
  detector.ts               the pure detector
  detector.test.ts          unit tests with generated sample traces
  entry.ts                  defineRunEntry / defineIngestionEntry
  scorer.ts                 createEntryScorer(entry): the Mastra scorer
  fault.ts                  the reproduction on the offline harness (not published)
  bed.integration.test.ts   real-stack smoke: clean runs clear, every fault severity fires
```

Then register it in two places:

- `src/entries/index.ts`: export the entry and its scorer. This is the published package surface; it holds no list
  of entries.
- `src/catalog/index.ts`: add one item to `catalog` (the entry bound to its retrieval tools, its fault cases bound
  to the harness and documents they run on, and its threshold sweeps from `src/catalog/threshold-sweeps.ts`). The
  catalog is the single list the bed, the demo, `pnpm docs:tables` and Studio read.

If you add a hard negative, add one variation to `src/catalog/clean-pool.ts`. A hard negative written in the fault
shape (`defineFault`, kept in your entry's `fault.ts`) becomes one variation per severity through
`hardNegativeVariations` there.

`src/catalog/index.ts` imports the existing entries from `src/catalog/bound-entries.ts`, which binds the factory
entries to the harness's retrieval tools; an entry that needs no binding can be imported straight from
`src/entries/index.ts`.

### 1. The page

`README.md` starts with YAML frontmatter that `src/catalog/entry-doc.ts` validates:

```yaml
---
id: my-failure
title: My failure
family: rag # rag | rag-ingest | tool-use | multi-agent
scope: run # run | ingestion
status: experimental # stable | experimental; start experimental
requires:
    - tool_call.output.hits[].score # every trace field the detector reads
thresholds:
    - name: MIN_SOMETHING
      value: 3
      basis: why this value, in one sentence a reviewer can check
      calibratedOn: prior # prior | dev | invariant
references:
    - title: 'Where this failure or its signal was described before'
      url: https://example.org/prior-work
      date: 2026-10-14
---
```

Then exactly these second-level sections, in this order: Symptom, Why no error is raised, Trace signature,
Detector, Thresholds and why, Reproduction, Known false alarms, Known misses, Credits, Results. A test checks the
page against the registered entry (id, title, family, scope, status, and every threshold's value, basis and
calibratedOn).

The Results section holds only the markers `<!-- docs-tables:results:start -->` and
`<!-- docs-tables:results:end -->`. Never type numbers there, or anywhere else on the page: `pnpm docs:tables`
renders the block from `results/offline/report.json`, and `pnpm docs:tables --check` (run in CI) fails when a page
differs from it. A number the page needs beyond the results block belongs in a generated block too.

### 2. The detector, behind the wall

A detector is a pure function `(view, thresholds) => Verdict` over `RunView` or `IngestionView`
(`src/trace/model.ts`). It returns `fired` with a severity in 0..1 and the span ids it read, `clear` with a summary,
or `not-applicable` with a reason. It never throws for a trace it does not understand.

The information wall: `detector.ts` may import only `src/trace/model.ts`, `src/text/*.ts` and its own `model.ts`.
The wall is enforced twice: ESLint rejects any other import in a detector (and any `import()`), and
`src/entries/detector-wall.test.ts` walks each detector's runtime import graph and fails on anything beyond
`src/trace/model.ts`, `src/text/*`, the entry's own `model.ts`, `contract.ts`, `errors.ts` and zod. A detector cannot
see the harness, the fault or any label, so it can only succeed by reading the trace. Published entry code
(everything except `fault*.ts` and tests) may not import the harness at all, and an entry's `model.ts` may not
import its `fault*.ts`.

### 3. Thresholds: name the basis

Every threshold has a `basis` and a `calibratedOn`:

- `invariant`: a property of any correct run (for example, zero vectors missing from the index);
- `prior`: set from the literature or first principles before looking at bed results;
- `dev`: tuned on the dev split only. Held-out families are never used to choose a value.

Add a sweep for each threshold in `src/catalog/threshold-sweeps.ts`, wide enough to show where catches drop and
where false alarms start.

### 4. The fault

A fault (`defineFault` in `src/harness/fault.ts`) changes harness mechanisms only: the embedder, the retriever,
tool output, or the model policy. It never edits a trace. Give it at least two severities, so the bed shows more
than one point. If it needs a particular document layout or the multi-agent harness, bind it so in the catalog
item; a multi-agent fault on the single-agent harness changes nothing and would read as a miss.

### 5. A hard negative

Build at least one clean variation that tempts your detector: a run that looks like the failure but is correct
(the agent retries a transient error, abstains on an empty retrieval, pages through a source). Add it to the clean
pool with `hardNegativeFor: [yourEntry.id]`. False alarms on hard negatives are reported separately.

### 6. Measure

```sh
pnpm bed --entry my-failure --split dev          # iterate here
pnpm bed --entry my-failure --split held-out     # look once you stop tuning
pnpm bed --split all --write-results             # before the pull request: regenerates results/offline/
pnpm docs:tables                                 # renders the README tables and every entry page from them
pnpm docs:charts                                 # renders the README charts from the same results
```

`--entry` runs your faults and the whole clean pool on both harnesses, so its false-alarm count matches what the
full bed will publish; it writes nothing.

Read the outputs, not only the exit code: the score distributions, the evidence summaries, the confusion matrix
row for your fault. A detector that is right for the wrong reason is the failure this project exists to catch.

## Pull request checklist

- [ ] `pnpm check` passes (typecheck, lint, format, unit and integration tests, package build).
- [ ] `pnpm demo` runs offline.
- [ ] New entry: page sections and frontmatter valid, thresholds have a `basis`, at least one hard negative,
      `pnpm bed --split all --write-results`, `pnpm docs:tables` and `pnpm docs:charts` run, numbers not edited by
      hand.
- [ ] Prior work credited in the page's references and Credits section.
- [ ] Known false alarms and known misses written down honestly.
- [ ] No secrets, no API calls in tests, no `.env`.

## Code style

Follow the conventions already in this repository: read the neighbouring code first and match it. Plain, strict TypeScript: ESM, Node 24, `node:` imports, zod for every external
shape, discriminated unions for results instead of throwing across module boundaries, named `Error` subclasses in
an `errors.ts` per module, pure functions and readonly data, no `any`, no type assertions except `as const`.
Prettier and ESLint settle formatting. Dependencies are pinned to exact versions.

## Releases

Maintainers publish releases from CI: publishing a GitHub Release runs `.github/workflows/release.yml`, which checks
and builds the package and publishes it to npm with trusted publishing, so each version carries an npm provenance
attestation that links it to this repository and the workflow run.
