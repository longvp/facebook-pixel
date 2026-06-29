# CAPI Events from Web Pixel + Audit Log + Home Dashboard (Design)

- **Date**: 2026-06-29
- **Status**: Approved (design)
- **Builds on**: the existing Facebook Pixel & CAPI app (web pixel fires browser
  beacons; `app/lib/capi.server.ts` already builds/sends CAPI events).

## 1. Purpose

Extend the storefront Web Pixel so that, in addition to the browser pixel beacon
it already fires, each tracked event is also sent **server-side via the Facebook
Conversions API (CAPI)** and **logged to the database**. Surface the logged events
in a new **Home dashboard** showing event counts per pixel × event type.

## 2. Decisions

| Area | Decision |
|------|----------|
| CAPI trigger/flow | Web Pixel → app endpoint → server fires CAPI + logs to DB |
| Endpoint | **Shopify App Proxy** (`/apps/<subpath>/capi`, Shopify-signed, same-origin) |
| DB purpose | **Audit log** — send immediately, record the result |
| Events | All 5: PageView, ViewContent, AddToCart, InitiateCheckout, Purchase |
| Home page content | Counts per **pixel × event type** (+ totals) |
| Home placement | Becomes the app **index** (`/app`); pixel list moves to `/app/pixels` |

## 3. Architecture & Data Flow

```
Shopper action → Web Pixel (sandbox)
  ├─ (existing) browser beacon facebook.com/tr  [eid]
  └─ (new) POST {eventName,eventId,url,currency,value,fbp,fbc,userAgent,email?,phone?}
           → https://<shop>/apps/<subpath>/capi              (App Proxy, signed)
                 │
         capi proxy route: authenticate.public.appProxy → shop
                 │
         for each Pixel where active && capiEnabled (shop):
            buildEvent(... decrypted token ...) → sendEvents → Graph API
            logCapiEvent(shop,pixelId,eventName,eventId,value,currency,status,response)
                 │
             return 200 (always)
```

CAPI uses the **same `event_id` (= `eid`)** as the browser beacon → Facebook
deduplicates browser + server events.

## 4. Components / Files

| File | Change |
|------|--------|
| `shopify.app.toml` | Add `[app_proxy]` (prefix, subpath, url) |
| `extensions/web-pixel-fb/src/index.js` | After the beacon, POST event (+ `_fbp`/`_fbc` cookies via sandbox `browser.cookie`, userAgent) to the proxy `/capi` path on the shop origin |
| `app/routes/capi.tsx` | New proxy route. Verifies `authenticate.public.appProxy`; calls `handleCapiEvent`; returns 200 |
| `app/lib/capi.server.ts` | Extend `buildEvent` to accept `fbp`/`fbc` (NOT hashed) in `user_data` |
| `app/lib/capiHandler.server.ts` | New: `handleCapiEvent(shop, payload, deps)` — pure, testable orchestration (list pixels, build/send, log) |
| `prisma/schema.prisma` | Add `CapiEventLog` model + migration |
| `app/models/capiEventLog.server.ts` | New: `logCapiEvent(...)`, `countByPixelAndEvent(shop)` |
| `app/routes/app._index.tsx` | Becomes the **Home dashboard** (counts per pixel × event) |
| `app/routes/app.pixels._index.tsx` | Pixel list (moved from the old `app._index`) |
| `app/routes/app.tsx` | NavMenu: **Home** (`/app`) + **Pixels** (`/app/pixels`) |
| `e2e/pixels.spec.ts` | `beforeEach` → `/app/pixels` (list moved) |

## 5. Data Model

```prisma
model CapiEventLog {
  id        String   @id @default(cuid())
  shop      String   @db.VarChar(255)
  pixelId   String   @db.VarChar(32)
  eventName String   @db.VarChar(64)
  eventId   String   @db.VarChar(128)   // = eid; dedup key with the browser beacon
  value     Float?
  currency  String?  @db.VarChar(8)
  status    String   @db.VarChar(16)    // "ok" | "failed"
  response  String?  @db.Text           // FB response body or error message
  createdAt DateTime @default(now())

  @@index([shop])
  @@index([shop, eventName])
}
```

## 6. Home Dashboard

- Loader: `countByPixelAndEvent(shop)` →
  `prisma.capiEventLog.groupBy({ by: ["pixelId","eventName"], where:{shop}, _count:true })`,
  joined with `Pixel` for the name, pivoted to a table.
- UI (Polaris `IndexTable`/`DataTable`): rows = pixels, columns =
  PageView · ViewContent · AddToCart · InitiateCheckout · Purchase · **Total**.
- Empty state when no events logged yet.

## 7. Matching (user_data) & Dedup

- Web pixel forwards **`_fbp` / `_fbc`** (sandbox `browser.cookie`) + **userAgent**;
  `email`/`phone` only on `checkout_completed` (hashed SHA-256 server-side).
- `fbp`/`fbc` go into `user_data` **un-hashed**; email/phone hashed.
- Dedup: `event_id = eid` shared with the browser beacon.
- **Known limitation:** via App Proxy the request reaches the app from Shopify's
  edge, so the shopper's real client IP is best-effort (header, may be absent);
  fbp/fbc/UA carry the match signal.

## 8. Error Handling & Testing

- CAPI send failure → log `status="failed"` + error; the proxy route **always
  returns 200** so the storefront isn't disrupted.
- **Unit (Vitest):** `handleCapiEvent` (mock pixels + sendEvents + logger),
  `logCapiEvent` + `countByPixelAndEvent` (mock prisma), `buildEvent` fbp/fbc.
- **E2E (Playwright):** update existing specs for `/app/pixels`; add a Home spec
  asserting the dashboard renders counts (seed a `CapiEventLog` row in global
  setup or via a created pixel).
- TDD red-green throughout (per project rules).

## 9. Out of Scope (YAGNI)

- Queue/retry of CAPI sends (chose audit-log, send-immediately).
- Time-range filters / charts on the dashboard (counts only for now).
- Per-event raw payload inspection UI.
