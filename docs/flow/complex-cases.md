# Complex Cases — Facebook Pixel & CAPI Manager

Tasks classified **complex**: large or risky, needing user involvement, a spike,
or careful decomposition before/while executing.

---

## C-1: Shopify CLI scaffold (Task 5)

**Why complex**
- Interactive: requires Shopify Partner login via browser and template prompts —
  cannot be run head-less by an agent.
- Network-dependent; output directory/layout varies slightly by CLI version.
- It is a hard prerequisite: every `now` task (T6–T13) modifies files this step
  creates (`app/`, `prisma/`, `shopify.app.toml`, `app/db.server.ts`,
  `app/shopify.server.ts`).

**Proposed approach**
1. User runs `npm init @shopify/app@latest -- --template=remix` (via `!` in session).
2. Choose: Remix template, Prisma storage. Name app `facebook-pixel`.
3. Agent verifies scaffold: `npm install && npm run build` succeeds; confirm
   `app/db.server.ts` exports the Prisma client as default (the model in T8
   imports `prisma from "../db.server"`). If the export name differs, adjust T8.
4. Agent adds Vitest (`npm i -D vitest @vitest/coverage-v8`) + test scripts.
5. Commit the scaffold before starting T6.

**Risk to watch:** the default template may scaffold SQLite + an existing
`Session` model in `schema.prisma`. T6 must edit (not duplicate) the datasource
and keep the template's `Session` model intact.

---

## C-2: Web Pixel Extension (Task 14)

**Why complex**
- Runs in Shopify's **sandboxed** Web Pixel runtime — no DOM access assumptions,
  limited globals; must bootstrap `fbq` correctly inside the sandbox.
- Needs configuration of **which pixels are active** at runtime. The extension
  `settings` only hold simple fields; syncing the merchant's active-pixel list
  into the extension (and updating it when toggled) is non-trivial.
- Event mapping from Shopify standard analytics events → Facebook standard events.
- Deduplication contract with server CAPI (`event_id = order-<id>`) must match T13 exactly.

**Proposed decomposition (spike first)**
1. **Spike:** create the extension with a hard-coded single pixel ID, subscribe
   to `page_viewed`, confirm a `facebook.com/tr` request fires on a dev store.
2. Add remaining standard events (ViewContent, AddToCart, InitiateCheckout, Purchase).
3. Add `eventID: order-<id>` on Purchase; verify dedup in Events Manager.
4. **Active-pixel sync:** decide the delivery mechanism for active pixel IDs:
   - (a) App writes a comma-separated `pixelIds` into the extension settings when
     pixels change (simple, but settings updates need the Admin API), OR
   - (b) Extension fetches active pixels from a public app endpoint at runtime.
   Recommend (a) for v1; revisit if it proves too slow to propagate.
5. Honor `active` + `trackingMode` (once the page-picker decision lands).

**Dependency:** depends on the tracking-pages decision (see `questions.md`) for
full correctness, but steps 1–3 can proceed independently.
