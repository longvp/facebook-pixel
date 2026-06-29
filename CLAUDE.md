# Facebook Pixel & CAPI — Shopify Embedded App

Shopify embedded app to manage Facebook Pixels & the Conversions API (CAPI).

## Stack
- Node 18.20+, Remix, Shopify App Remix template
- UI: Polaris React (`@shopify/polaris`) + App Bridge
- DB: MySQL via Prisma
- Tracking: Web Pixel Extension (browser) + server-side CAPI (webhooks)
- Tests: Vitest (unit) + Playwright (E2E)

## Structure
- `app/routes/` — Remix routes (loaders/actions). `app.*` = embedded admin pages.
- `app/models/` — data access (Prisma). `*.server.ts` = server-only.
- `app/lib/` — crypto, CAPI client, helpers.
- `extensions/web-pixel-fb/` — Web Pixel Extension.
- `prisma/schema.prisma` — DB schema.
- `docs/superpowers/` — specs & plans. `docs/flow/` — flow outputs. `docs/ui/` — UI mockup.

## Common commands
- `npm run dev` / `shopify app dev` — run app against a dev store
- `npx prisma migrate dev --name <x>` — create + apply migration
- `npx prisma studio` — browse data
- `npm test` — run Vitest (unit)
- `npx playwright test` — run Playwright E2E
- `npm run lint` — ESLint

## Conventions
- Server-only code lives in `*.server.ts`. Never import a `.server.ts` into client code.
- All data access goes through `app/models/`. Routes call models, not Prisma directly.
- `accessToken` is encrypted at rest (AES-256-GCM, `app/lib/crypto.server.ts`) and never sent to the client in plaintext.
- Pixel ID is unique per shop and immutable after create.
- Match the approved UI in `docs/ui/pixel-app-ui.html` using real Polaris React components.

## Rules (must follow)
1. **Re-read context before a new feature.** Before starting any new feature,
   re-read `CLAUDE.md` and the relevant `docs/superpowers/specs/`,
   `docs/superpowers/plans/`, and `docs/flow/` files so you work from the current
   design, not memory.
2. **TDD — write the test first.** For every feature or bugfix, write a failing
   test before the implementation, watch it fail, then make it pass.
3. **Never commit or push autonomously.** You may edit files freely (including on
   `main`), but do NOT run `git commit` or `git push` on your own initiative — only
   when the user explicitly asks. A `PreToolUse` guard hook
   (`.claude/hooks/guard-git.mjs`) forces a confirmation prompt before any
   `git commit`/`git push`, so it can never happen silently.

## Development flow (slash commands)
`/brainstorm` → `/plan` → `/userstories` → `/classify` → `/execute` → `/verify`.
Each writes its output under `docs/flow/`. See `.claude/commands/`.
