# Task Classification — Facebook Pixel & CAPI Manager

Tasks from `docs/superpowers/plans/2026-06-28-facebook-pixel-capi-app.md`,
classified into **now** (safe to build immediately), **complex** (large/risky —
see `complex-cases.md`), **discuss** (blocked on a decision — see `questions.md`).

> Scope note: page-level tracking selection (All/Selected/Excluded) was dropped —
> no enum, column, or UI. This removed former story US-8 and question Q-1.

| Task | Story | Group | Reason |
|------|-------|-------|--------|
| T1 CLAUDE.md | — | ✅ done | Phase 0 complete (commit 0f4482f) |
| T2 settings.json + hook | — | ✅ done | Phase 0 complete (commit a269c45) |
| T3 flow commands | — | ✅ done | Phase 0 complete (commit ab5ac7a) |
| T4 skills | — | ✅ done | Phase 0 complete (commit 8bc9b99) |
| T5 Shopify CLI scaffold | — | **complex** | Interactive (Partner login, template prompts); needs the user + network. See complex-cases. |
| T6 Prisma → MySQL + Pixel model | US-1 | **now** | Schema is fully specified; mechanical migration. |
| T7 AES-256-GCM token crypto | US-7 | **now** | Self-contained, unit-tested, full code in plan. |
| T8 Pixel data-access model | US-1..7 | **now** | CRUD + validation specified; unit-tested. |
| T9 CAPI event builder + sender | US-9 | **now** | Pure functions + fetch; unit-tested. |
| T10 Pixel list screen (Polaris) | US-1,2,5,6,7 | **now** | UI fully specified against mockup. |
| T11 Add pixel screen | US-3,7 | **now** | Form specified; shared component. |
| T12 Edit pixel screen | US-4,7 | **now** | Mirrors T11; Pixel ID immutable. |
| T13 orders/create webhook → Purchase | US-9 | **now** | Wires T8+T9; verified against dev store. |
| T14 Web Pixel Extension | US-8 | **complex** | Sandbox runtime, settings wiring (which pixels are active), event mapping, dedup. See complex-cases. |
| Test event code persistence | US-7 | **discuss** | Store vs transient undecided. See questions.md. |

## Summary
- **now (8):** T6, T7, T8, T9, T10, T11, T12, T13 → ready for `/execute` (recommended order: T6 → T7 → T8 → T9 → T13 → T10 → T11 → T12).
- **complex (2):** T5 (scaffold — must run first, needs user), T14 (web pixel extension).
- **discuss (1):** test-event-code persistence — resolve before it blocks T8/T11/T12 (currently the form writes whatever is entered).

> Note: T5 (scaffold) is "complex" only because it is interactive — it is a prerequisite for all `now` tasks and must be completed (by the user) before `/execute` can run.
