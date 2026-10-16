## What this changes

<!-- One or two sentences. Link the issue it addresses. -->

## How it was checked

- [ ] `pnpm check` passes.
- [ ] `pnpm demo` runs offline.
- [ ] For a new or changed entry: `pnpm bed --split all --write-results`, `pnpm docs:tables` and
      `pnpm docs:charts` were run, and no number in a generated block or chart was edited by hand.
- [ ] Outputs were read, not only exit codes: score distributions, evidence summaries, the confusion matrix row.

## New entry only

- [ ] Page frontmatter and sections valid; every threshold has a `basis` and `calibratedOn`.
- [ ] At least one hard negative in the clean pool.
- [ ] Known false alarms and known misses written down.
- [ ] Prior work credited.

## Safety

- [ ] No secrets, no `.env`, no API calls in tests or offline scripts.
