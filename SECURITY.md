# Security

## Reporting a vulnerability

Please report security problems privately through GitHub's "Report a vulnerability" button on this repository's
Security tab, not in a public issue. Include what you found, how to reproduce it, and its impact. You should get a
first answer within a week.

## What is in scope

- **Secrets.** The only secret this project handles is an optional `ANTHROPIC_API_KEY` in `.env`, used by the
  three live commands alone: `pnpm demo:live`, `pnpm studio:live` and `pnpm demonstration:live`. They read it through
  one module and never copy it into `process.env`, logs, traces or fixtures. A path that leaks it, or that lets an
  offline command (tests, `pnpm demo`, `pnpm bed`, `pnpm replay`, `pnpm repros`, `pnpm studio`,
  `pnpm demonstration`, Docker) load it, is a vulnerability.
- **Recorded fixtures.** `fixtures/` holds sanitized traces. A field that carries a secret, a personal path or an
  email address into a fixture is a vulnerability; `fixtures/README.md` lists what is kept.
- **Spending.** Two caps bound what the live commands can spend: `pnpm demo:live` stops at `--max-usd` (default
  USD 10), and `pnpm studio:live` and `pnpm demonstration:live` share the Studio cap `STUDIO_LIVE_MAX_USD` (default
  USD 1). A way to make any of them spend past its cap is a vulnerability.

Detector misses and false alarms are not security issues: please use the false-alarm issue template.

## Supported versions

Only the latest commit on the default branch is supported.
