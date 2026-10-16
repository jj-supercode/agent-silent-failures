# AGENTS.md

Guidance for coding agents working in this repository. Humans: the same rules, explained at length, are in
[CONTRIBUTING.md](CONTRIBUTING.md).

## What this project is

A catalog of silent agent failures (output that looks fine while no error is raised). Each entry is a reproducible
fault, a deterministic detector over a recorded run, and a Mastra scorer, measured by a test bed for catch rate and
false-alarm rate. Every published number is regenerated from committed data.

## Layout

- `src/entries/<id>/`: one folder per catalog entry (`README.md`, `detector.ts`, `model.ts`, `fault*.ts`,
  `scorer.ts`, `entry.ts`, tests). Published package surface: `src/entries`, `src/trace`, `src/text`,
  `src/ingestion` (fault files excluded).
- `src/trace/`: Mastra spans to the framework-neutral `RunView` and `IngestionView` (`src/trace/model.ts`).
- `src/text/`: pure text helpers detectors may use.
- `src/harness/`: the offline Mastra stack (agents, tools, scripted model, ingestion). Never published.
- `src/catalog/`: the single bound list of entries, faults, clean pool and threshold sweeps.
- `src/bed/`, `src/replay/`, `src/live/`, `src/studio/`: the test bed, replay of recorded traces, live recording,
  Studio entries.
- `results/`, `fixtures/`: generated results and recorded traces. Regenerate them; never edit them by hand.

## Commands

```sh
pnpm install
pnpm check                                  # the gate: typecheck, lint, format, unit + integration tests, package
pnpm test                                   # fast unit tests only
pnpm test:integration                       # real embedder, LibSQL and Mastra runs, one worker
pnpm bed --entry <id> --split dev           # measure one entry while iterating
pnpm bed --split all --write-results        # regenerate results/offline before a pull request
pnpm docs:tables && pnpm docs:charts        # regenerate README tables, entry pages and charts from results
pnpm replay                                 # score the committed real-model traces offline
```

The project's own commands (`demo`, `bed`, `replay`, `repros`, `demonstration`, `docs:tables`, `docs:charts`) take
`--json` for newline-delimited JSON events (schema in the README, "For agents and CI") and `--help`; their exit
codes are documented per command. Use Node 24.22 or newer (`.nvmrc`) and pnpm.

## Hard rules

- **No paid calls, no secrets.** Never read `.env`. Never run `pnpm demo:live`, `pnpm demonstration:live` or
  `pnpm studio:live` without `--dry-run`: they call Anthropic and are run only by maintainers. Everything else runs
  offline.
- **Never type a number into a README or entry page.** Regenerate with `pnpm bed --write-results`,
  `pnpm docs:tables` and `pnpm docs:charts`; `--check` fails in CI when a page is stale.
- **The detector wall.** A `detector.ts` imports only `src/trace/model.ts`, `src/text/*.ts` and its own `model.ts`.
  ESLint and `src/entries/detector-wall.test.ts` enforce it. A detector is a pure function
  `(view, thresholds) => Verdict` and never throws for a trace it does not understand.
- **Faults change mechanisms, not traces.** A fault (`defineFault`, `src/harness/fault.ts`) changes the embedder,
  retriever, tool output or model policy, never a recorded trace.
- **Thresholds carry a `basis` and a `calibratedOn`** (`invariant`, `prior` or `dev`); never tune on held-out data
  or on recorded traces.
- **Add a hard negative** for every new entry: a correct run that looks like the failure.
- **Do not overclaim.** A detector that does not fire because the model recovered is a correct clear, not a miss.

## Code style

Follow the conventions already in this repository: read the neighbouring code first and match it. Plain, strict TypeScript: ESM, `node:` imports, zod for every external shape,
types inferred from schemas, branded IDs and unit-bearing numbers (one definition per brand, in its module's
`model.ts`), discriminated unions instead of throwing across modules, named `Error` subclasses in each module's
`errors.ts`, pure functions and readonly data, one responsibility per file and per function, self-descriptive
names. No `any`, no type assertions except `as const`, no non-null `!`, no `@ts-ignore`, no TODOs. Dependencies are
pinned exactly. Tests: Vitest; names read as specifications; `*.integration.test.ts` for anything touching the real
embedder, LibSQL or a Mastra agent.

## Before you finish

1. `pnpm format` (Prettier writes the house style) and `pnpm lint` (ESLint, zero warnings allowed). Fix lint findings
   in the code; never silence a rule.
2. `pnpm check`: typecheck, lint, format check, unit and integration tests, package build. It must exit 0.
3. Read the bed output for your entry (distributions, evidence, confusion-matrix row), not only the exit code.
4. `pnpm docs:tables --check` and `pnpm docs:charts --check` pass.
