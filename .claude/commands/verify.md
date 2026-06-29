---
description: Phase 6 — verify the work against acceptance criteria via tests (TDD), with real evidence.
---
You are in the VERIFY phase for: $ARGUMENTS

Verify **through automated tests**, TDD-style — acceptance criteria are proven by
tests, not by manual clicking. Every user story in `docs/flow/user-stories.md`
must map to one or more tests:

- **Unit (Vitest)** — backend logic: crypto, model, CAPI builder/sender.
- **E2E (Playwright)** — user-facing flows end-to-end: list, add, edit (Pixel ID
  immutable), delete (confirm modal), search, active/CAPI toggles, CAPI requires
  token. See the Playwright E2E task in the plan.

Steps:
1. **Coverage map first.** For each acceptance criterion, identify the covering
   test (file + test name). If a criterion has NO test, that is a TDD gap — write
   the failing test first, watch it fail, then make it pass before claiming the
   criterion verified.
2. **Run unit tests:** `npm test` — capture output.
3. **Run E2E:** `npx playwright test` — capture output (start the app/test server
   as the Playwright config requires).
4. **Lint:** `npm run lint`.
5. Write `docs/flow/verification.md`: a table of `user story | acceptance criterion
   | test (file::name) | pass/fail | evidence`. Paste real command output as
   evidence — never assert success without it.
6. List any gaps (untested criteria) explicitly; do not mark them passed.

Use superpowers:verification-before-completion — evidence before assertions, always.
Do NOT commit or push; report results and let the user decide next steps.
