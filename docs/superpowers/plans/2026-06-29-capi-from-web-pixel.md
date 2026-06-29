# CAPI from Web Pixel + Audit Log + Home Dashboard — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send each storefront Web Pixel event to the Facebook Conversions API server-side (via a Shopify App Proxy), log every CAPI event to the database, and show a Home dashboard of event counts per pixel × event type.

**Architecture:** The Web Pixel POSTs each event to an App-Proxy route; the route runs a pure `handleCapiEvent` orchestrator that, for every active CAPI-enabled pixel, builds + sends a CAPI event (reusing `app/lib/capi.server.ts`) and writes a `CapiEventLog` row. The app index becomes a Home dashboard reading aggregated counts; the pixel list moves to `/app/pixels`.

**Tech Stack:** Remix, Polaris React, Prisma + MySQL, `@shopify/shopify-app-remix` (App Proxy auth), Web Pixel Extension, Vitest (unit) + Playwright (E2E).

## Global Constraints

- TDD red-green: write the failing test first, watch it fail, then implement (project rule in CLAUDE.md).
- Reuse existing modules: `app/lib/capi.server.ts` (`buildEvent`/`sendEvents`/`hashPII`), `app/models/pixel.server.ts` (`listPixels`/`getDecryptedToken`), `requireAdmin` shim.
- CAPI fires only for pixels where `active && capiEnabled`; token decrypted server-side.
- The proxy route **always returns 200**; CAPI failures are logged (`status:"failed"`), never thrown to the storefront.
- Dedup: CAPI `event_id` = the `eid` the browser beacon already uses.
- `fbp`/`fbc` go into `user_data` **un-hashed**; email/phone hashed (SHA-256) server-side.
- Standard events only: PageView, ViewContent, AddToCart, InitiateCheckout, Purchase.
- Unit tests `*.test.ts` (Vitest, node env); E2E `e2e/*.spec.ts` (Playwright) use the `requireAdmin` E2E shim.
- Tests run on MySQL `facebook_pixel_scaffold` (dev) / `facebook_pixel_e2e` (E2E).

---

## File Structure

- `prisma/schema.prisma` — add `CapiEventLog` model (+ migration).
- `app/models/capiEventLog.server.ts` — `logCapiEvent`, `countByPixelAndEvent`, `pivotCounts`.
- `app/lib/capi.server.ts` — extend `buildEvent` with `fbp`/`fbc`.
- `app/lib/capiHandler.server.ts` — `handleCapiEvent(shop, payload)` orchestrator.
- `app/routes/capi.tsx` — App Proxy route (POST) → `handleCapiEvent`.
- `extensions/web-pixel-fb/src/index.js` — POST events (+fbp/fbc/UA) to the proxy.
- `shopify.app.toml` — `[app_proxy]` config.
- `app/routes/app.pixels._index.tsx` — pixel list (moved from `app._index`).
- `app/routes/app._index.tsx` — Home dashboard.
- `app/routes/app.tsx` — NavMenu Home + Pixels.
- `e2e/pixels.spec.ts` — navigate to `/app/pixels`; `e2e/home.spec.ts` — Home renders.
- `e2e/global-setup.ts` — also clear `CapiEventLog`.

---

## Task 1: CapiEventLog model + migration

**Files:**
- Modify: `prisma/schema.prisma`

**Interfaces:**
- Produces: `CapiEventLog` table consumed by `app/models/capiEventLog.server.ts`.

- [ ] **Step 1: Add the model to `prisma/schema.prisma`**

```prisma
model CapiEventLog {
  id        String   @id @default(cuid())
  shop      String   @db.VarChar(255)
  pixelId   String   @db.VarChar(32)
  eventName String   @db.VarChar(64)
  eventId   String   @db.VarChar(128)
  value     Float?
  currency  String?  @db.VarChar(8)
  status    String   @db.VarChar(16)
  response  String?  @db.Text
  createdAt DateTime @default(now())

  @@index([shop])
  @@index([shop, eventName])
}
```

- [ ] **Step 2: Create + apply the migration (dev DB)**

Run: `npx prisma migrate dev --name add_capi_event_log`
Expected: migration applied; `CapiEventLog` table exists.

- [ ] **Step 3: Apply to the E2E DB**

Run: `DATABASE_URL="mysql://root:@127.0.0.1:3306/facebook_pixel_e2e" npx prisma migrate deploy`
Expected: "All migrations have been successfully applied."

- [ ] **Step 4: Commit**

```bash
git add prisma
git commit -m "feat: add CapiEventLog model"
```

---

## Task 2: CapiEventLog data-access (log + aggregate + pivot)

**Files:**
- Create: `app/models/capiEventLog.server.ts`
- Test: `app/models/capiEventLog.server.test.ts`

**Interfaces:**
- Consumes: `prisma` from `app/db.server`.
- Produces:
  - `logCapiEvent(input: CapiLogInput): Promise<void>` where
    `CapiLogInput = { shop; pixelId; eventName; eventId; value?: number|null; currency?: string|null; status: "ok"|"failed"; response?: string|null }`.
  - `countByPixelAndEvent(shop: string): Promise<Array<{ pixelId: string; eventName: string; count: number }>>`.
  - `pivotCounts(rows, pixels): PivotRow[]` where `pixels: {pixelId:string; name:string}[]` and `PivotRow = { pixelId; name; counts: Record<string, number>; total: number }`. Pure function (no DB).
  - `EVENT_NAMES = ["PageView","ViewContent","AddToCart","InitiateCheckout","Purchase"] as const`.

- [ ] **Step 1: Write the failing test**

```ts
// app/models/capiEventLog.server.test.ts
import { describe, it, expect, vi } from "vitest";

vi.mock("../db.server", () => ({
  default: {
    capiEventLog: {
      create: vi.fn(async () => ({})),
      groupBy: vi.fn(async () => [
        { pixelId: "111", eventName: "PageView", _count: { _all: 3 } },
        { pixelId: "111", eventName: "Purchase", _count: { _all: 1 } },
      ]),
    },
  },
}));

import prisma from "../db.server";
import { logCapiEvent, countByPixelAndEvent, pivotCounts } from "./capiEventLog.server";

describe("capiEventLog", () => {
  it("logCapiEvent inserts a row", async () => {
    await logCapiEvent({
      shop: "s", pixelId: "111", eventName: "Purchase", eventId: "e1",
      value: 9.5, currency: "USD", status: "ok", response: "{}",
    });
    expect((prisma as any).capiEventLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ shop: "s", pixelId: "111", status: "ok" }),
    });
  });

  it("countByPixelAndEvent maps groupBy counts", async () => {
    const rows = await countByPixelAndEvent("s");
    expect(rows).toEqual([
      { pixelId: "111", eventName: "PageView", count: 3 },
      { pixelId: "111", eventName: "Purchase", count: 1 },
    ]);
  });

  it("pivotCounts builds per-pixel rows with totals", () => {
    const pivot = pivotCounts(
      [
        { pixelId: "111", eventName: "PageView", count: 3 },
        { pixelId: "111", eventName: "Purchase", count: 1 },
      ],
      [{ pixelId: "111", name: "My Pixel" }],
    );
    expect(pivot).toEqual([
      {
        pixelId: "111",
        name: "My Pixel",
        counts: { PageView: 3, ViewContent: 0, AddToCart: 0, InitiateCheckout: 0, Purchase: 1 },
        total: 4,
      },
    ]);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- capiEventLog`
Expected: FAIL — cannot find module `./capiEventLog.server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/models/capiEventLog.server.ts
import prisma from "../db.server";

export const EVENT_NAMES = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
] as const;

export type CapiLogInput = {
  shop: string;
  pixelId: string;
  eventName: string;
  eventId: string;
  value?: number | null;
  currency?: string | null;
  status: "ok" | "failed";
  response?: string | null;
};

export async function logCapiEvent(input: CapiLogInput): Promise<void> {
  await prisma.capiEventLog.create({
    data: {
      shop: input.shop,
      pixelId: input.pixelId,
      eventName: input.eventName,
      eventId: input.eventId,
      value: input.value ?? null,
      currency: input.currency ?? null,
      status: input.status,
      response: input.response ?? null,
    },
  });
}

export type CountRow = { pixelId: string; eventName: string; count: number };

export async function countByPixelAndEvent(shop: string): Promise<CountRow[]> {
  const rows = await prisma.capiEventLog.groupBy({
    by: ["pixelId", "eventName"],
    where: { shop },
    _count: { _all: true },
  });
  return rows.map((r: any) => ({
    pixelId: r.pixelId,
    eventName: r.eventName,
    count: r._count._all,
  }));
}

export type PivotRow = {
  pixelId: string;
  name: string;
  counts: Record<string, number>;
  total: number;
};

export function pivotCounts(
  rows: CountRow[],
  pixels: { pixelId: string; name: string }[],
): PivotRow[] {
  return pixels.map((p) => {
    const counts: Record<string, number> = {};
    for (const name of EVENT_NAMES) counts[name] = 0;
    let total = 0;
    for (const r of rows) {
      if (r.pixelId === p.pixelId && counts[r.eventName] !== undefined) {
        counts[r.eventName] = r.count;
        total += r.count;
      }
    }
    return { pixelId: p.pixelId, name: p.name, counts, total };
  });
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- capiEventLog`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/models/capiEventLog.server.ts app/models/capiEventLog.server.test.ts
git commit -m "feat: add CapiEventLog model access (log, count, pivot)"
```

---

## Task 3: Extend `buildEvent` with fbp/fbc

**Files:**
- Modify: `app/lib/capi.server.ts`
- Modify: `app/lib/capi.server.test.ts`

**Interfaces:**
- Consumes: existing `buildEvent`.
- Produces: `CapiEventInput` gains `fbp?: string` and `fbc?: string`; `buildEvent` writes them **un-hashed** into `user_data.fbp` / `user_data.fbc`.

- [ ] **Step 1: Write the failing test (append to `app/lib/capi.server.test.ts`)**

```ts
  it("includes fbp/fbc un-hashed in user_data", () => {
    const e = buildEvent({
      eventName: "Purchase",
      eventTime: 1,
      eventId: "x",
      fbp: "fb.1.123.456",
      fbc: "fb.1.123.abc",
    });
    expect(e.user_data.fbp).toBe("fb.1.123.456");
    expect(e.user_data.fbc).toBe("fb.1.123.abc");
  });
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- capi.server`
Expected: FAIL — `user_data.fbp` is undefined.

- [ ] **Step 3: Implement — add fields to the type and builder**

In `app/lib/capi.server.ts`, add to `CapiEventInput`:
```ts
  fbp?: string;
  fbc?: string;
```
In `buildEvent`, after the `userAgent` line in `user_data`:
```ts
  if (input.fbp) user_data.fbp = input.fbp;
  if (input.fbc) user_data.fbc = input.fbc;
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- capi.server`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/capi.server.ts app/lib/capi.server.test.ts
git commit -m "feat: support fbp/fbc in CAPI buildEvent"
```

---

## Task 4: `handleCapiEvent` orchestrator

**Files:**
- Create: `app/lib/capiHandler.server.ts`
- Test: `app/lib/capiHandler.server.test.ts`

**Interfaces:**
- Consumes: `listPixels`, `getDecryptedToken` (pixel.server); `buildEvent`, `sendEvents` (capi.server); `logCapiEvent` (capiEventLog.server).
- Produces: `handleCapiEvent(shop: string, payload: CapiPayload): Promise<void>` where
  `CapiPayload = { eventName: string; eventId: string; url?: string; currency?: string; value?: number; fbp?: string; fbc?: string; userAgent?: string; email?: string; phone?: string }`.
  For each active+capiEnabled pixel: build the event (`event_time = now`), send, and log `ok`/`failed`.

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/capiHandler.server.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/pixel.server", () => ({
  listPixels: vi.fn(async () => [
    { id: "p1", pixelId: "111", active: true, capiEnabled: true, testEventCode: null },
    { id: "p2", pixelId: "222", active: true, capiEnabled: false, testEventCode: null },
  ]),
  getDecryptedToken: vi.fn(async () => "tok"),
}));
const sendEvents = vi.fn(async () => ({ ok: true, status: 200, body: {} }));
vi.mock("./capi.server", async (orig) => ({ ...(await orig<any>()), sendEvents: (...a: any[]) => sendEvents(...a) }));
const logCapiEvent = vi.fn(async () => {});
vi.mock("../models/capiEventLog.server", () => ({ logCapiEvent: (...a: any[]) => logCapiEvent(...a) }));

import { handleCapiEvent } from "./capiHandler.server";

beforeEach(() => {
  sendEvents.mockClear();
  logCapiEvent.mockClear();
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("handleCapiEvent", () => {
  it("sends + logs only for active capi-enabled pixels", async () => {
    await handleCapiEvent("s.myshopify.com", {
      eventName: "Purchase", eventId: "order-9", currency: "USD", value: 10, fbp: "fb.1",
    });
    expect(sendEvents).toHaveBeenCalledTimes(1);
    expect(sendEvents.mock.calls[0][0]).toBe("111"); // pixelId of the enabled pixel
    expect(logCapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({ pixelId: "111", eventName: "Purchase", status: "ok" }),
    );
  });

  it("logs status=failed when the send fails", async () => {
    sendEvents.mockResolvedValueOnce({ ok: false, status: 400, body: { error: "bad" } });
    await handleCapiEvent("s.myshopify.com", { eventName: "PageView", eventId: "x" });
    expect(logCapiEvent).toHaveBeenCalledWith(expect.objectContaining({ status: "failed" }));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- capiHandler`
Expected: FAIL — cannot find module `./capiHandler.server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/lib/capiHandler.server.ts
import { listPixels, getDecryptedToken } from "../models/pixel.server";
import { buildEvent, sendEvents } from "./capi.server";
import { logCapiEvent } from "../models/capiEventLog.server";

export type CapiPayload = {
  eventName: string;
  eventId: string;
  url?: string;
  currency?: string;
  value?: number;
  fbp?: string;
  fbc?: string;
  userAgent?: string;
  email?: string;
  phone?: string;
};

export async function handleCapiEvent(shop: string, payload: CapiPayload): Promise<void> {
  const pixels = (await listPixels(shop)).filter((p) => p.active && p.capiEnabled);
  const eventTime = Math.floor(Date.now() / 1000);

  await Promise.all(
    pixels.map(async (p) => {
      const token = await getDecryptedToken(shop, p.id);
      if (!token) return;
      const event = buildEvent({
        eventName: payload.eventName,
        eventTime,
        eventId: payload.eventId,
        sourceUrl: payload.url,
        email: payload.email,
        phone: payload.phone,
        userAgent: payload.userAgent,
        fbp: payload.fbp,
        fbc: payload.fbc,
        currency: payload.currency,
        value: payload.value,
      });
      let status: "ok" | "failed" = "ok";
      let response = "";
      try {
        const res = await sendEvents(p.pixelId, token, [event], p.testEventCode);
        status = res.ok ? "ok" : "failed";
        response = JSON.stringify(res.body);
      } catch (e: any) {
        status = "failed";
        response = String(e?.message ?? e);
      }
      await logCapiEvent({
        shop,
        pixelId: p.pixelId,
        eventName: payload.eventName,
        eventId: payload.eventId,
        value: payload.value ?? null,
        currency: payload.currency ?? null,
        status,
        response,
      });
    }),
  );
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- capiHandler`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/capiHandler.server.ts app/lib/capiHandler.server.test.ts
git commit -m "feat: add handleCapiEvent orchestrator (send + log per pixel)"
```

---

## Task 5: App Proxy route + config

**Files:**
- Modify: `shopify.app.toml`
- Create: `app/routes/capi.tsx`

**Interfaces:**
- Consumes: `authenticate.public.appProxy` (shopify.server); `handleCapiEvent` (Task 4).
- Produces: `POST /apps/<subpath>/capi` → runs CAPI for the shop; always 200.

- [ ] **Step 1: Add the App Proxy block to `shopify.app.toml`**

```toml
[app_proxy]
url = "https://example.com"
subpath = "fbpixel"
prefix = "apps"
```
(The Shopify CLI rewrites `url` to the tunnel/app URL on `dev`/`deploy`.)

- [ ] **Step 2: Write the proxy route**

```tsx
// app/routes/capi.tsx
import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { handleCapiEvent } from "../lib/capiHandler.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Verifies the Shopify App Proxy signature and resolves the shop.
  const { session } = await authenticate.public.appProxy(request);
  if (!session?.shop) return json({ ok: false }, { status: 401 });

  const payload = await request.json().catch(() => null);
  if (!payload?.eventName || !payload?.eventId) {
    return json({ ok: false, error: "eventName and eventId are required" }, { status: 400 });
  }

  // Never block the storefront: log failures inside handleCapiEvent, always 200.
  await handleCapiEvent(session.shop, payload).catch((e) => console.error("capi proxy", e));
  return json({ ok: true });
};
```

- [ ] **Step 3: Verify it builds + the route is reachable**

Run: `npm run build`
Expected: build succeeds.
Then on a dev store (`shopify app dev`), `POST https://<shop>/apps/fbpixel/capi` with a JSON body returns `{ ok: true }` and a `CapiEventLog` row appears (verify in MySQL). Requires the app reinstalled so the proxy is registered.

- [ ] **Step 4: Commit**

```bash
git add shopify.app.toml app/routes/capi.tsx
git commit -m "feat: add App Proxy /capi route for web-pixel CAPI events"
```

---

## Task 6: Web Pixel forwards events to the proxy

**Files:**
- Modify: `extensions/web-pixel-fb/src/index.js`

**Interfaces:**
- Consumes: sandbox `browser.cookie` (read `_fbp`/`_fbc`), `init.context.navigator.userAgent`, the proxy `/apps/fbpixel/capi`.
- Produces: each event POSTed to the proxy in addition to the browser beacon.

- [ ] **Step 1: Update the extension to also POST to the proxy**

Change the `register` signature to include `browser` and `init`, and add a `sendCapi` helper. Full new file:

```js
import { register } from "@shopify/web-pixels-extension";

const PROXY_SUBPATH = "/apps/fbpixel/capi";

register(({ analytics, browser, settings, init }) => {
  const raw = settings.pixelIds;
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw.split(",");
    }
  }
  const pixelIds = (Array.isArray(parsed) ? parsed : String(parsed || "").split(","))
    .map((s) => String(s).trim())
    .filter(Boolean);
  if (!pixelIds.length) return;

  const userAgent = init?.context?.navigator?.userAgent || "";

  function fire(eventName, eventId, url, custom) {
    pixelIds.forEach((id) => {
      const params = new URLSearchParams({
        id, ev: eventName, dl: url || "", rl: "", if: "false",
        ts: String(Date.now()), eid: eventId, noscript: "1",
      });
      if (custom?.currency) params.set("cd[currency]", custom.currency);
      if (custom?.value != null) params.set("cd[value]", String(custom.value));
      fetch(`https://www.facebook.com/tr/?${params.toString()}`, {
        method: "GET", mode: "no-cors", keepalive: true,
      }).catch(() => {});
    });
  }

  async function sendCapi(eventName, eventId, url, custom, extra) {
    if (!url) return;
    let origin = "";
    try {
      origin = new URL(url).origin;
    } catch {
      return;
    }
    const [fbp, fbc] = await Promise.all([
      browser.cookie.get("_fbp").catch(() => ""),
      browser.cookie.get("_fbc").catch(() => ""),
    ]);
    fetch(`${origin}${PROXY_SUBPATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventName, eventId, url, userAgent, fbp, fbc,
        currency: custom?.currency,
        value: custom?.value != null ? Number(custom.value) : undefined,
        ...(extra || {}),
      }),
    }).catch(() => {});
  }

  function track(eventName, event, custom, extra) {
    const url = event?.context?.document?.location?.href || "";
    const eventId = event.id;
    fire(eventName, eventId, url, custom);
    sendCapi(eventName, eventId, url, custom, extra);
  }

  analytics.subscribe("page_viewed", (e) => track("PageView", e));
  analytics.subscribe("product_viewed", (e) => track("ViewContent", e));
  analytics.subscribe("product_added_to_cart", (e) => track("AddToCart", e));
  analytics.subscribe("checkout_started", (e) => track("InitiateCheckout", e));
  analytics.subscribe("checkout_completed", (e) => {
    const checkout = e?.data?.checkout;
    const orderId = checkout?.order?.id;
    const email = checkout?.email || checkout?.order?.customer?.email || undefined;
    const phone = checkout?.phone || undefined;
    track(
      "Purchase",
      { ...e, id: orderId ? `order-${orderId}` : e.id },
      { currency: checkout?.totalPrice?.currencyCode, value: checkout?.totalPrice?.amount },
      { email, phone },
    );
  });
});
```

- [ ] **Step 2: Verify (dev store, manual)**

Run: `npm run deploy` then `shopify app dev`; browse the storefront.
Expected: Network tab shows both `facebook.com/tr` (beacon) and a POST to `/apps/fbpixel/capi`; `CapiEventLog` rows appear with `status="ok"` (when a pixel has CAPI enabled + a valid token).

- [ ] **Step 3: Commit**

```bash
git add extensions/web-pixel-fb/src/index.js
git commit -m "feat: web pixel forwards events to the CAPI proxy (fbp/fbc/UA)"
```

---

## Task 7: Move pixel list to `/app/pixels`; NavMenu

**Files:**
- Create: `app/routes/app.pixels._index.tsx` (move current `app._index.tsx` content)
- Modify: `app/routes/app.tsx` (NavMenu)
- Modify: `e2e/pixels.spec.ts` (navigate to `/app/pixels`)

**Interfaces:**
- Produces: pixel list at `/app/pixels`; Home left free for Task 8.

- [ ] **Step 1: Move the file**

```bash
git mv app/routes/app._index.tsx app/routes/app.pixels._index.tsx
```
No code change inside is required: it already links to `/app/pixels/new` and `/app/pixels/:id`, and uses `requireAdmin` + the pixel model.

- [ ] **Step 2: Update NavMenu in `app/routes/app.tsx`**

Replace the `<NavMenu>` block (non-E2E branch) with:
```tsx
      <NavMenu>
        <Link to="/app" rel="home">
          Home
        </Link>
        <Link to="/app/pixels">Pixels</Link>
      </NavMenu>
```

- [ ] **Step 3: Point the E2E specs at `/app/pixels`**

In `e2e/pixels.spec.ts`, change the `beforeEach`:
```ts
test.beforeEach(async ({ page }) => {
  await page.goto("/app/pixels");
});
```

- [ ] **Step 4: Run E2E to confirm the move (Task 8 adds Home)**

Run: `npm run test:e2e -- pixels`
Expected: the 7 pixel specs PASS against `/app/pixels`.

- [ ] **Step 5: Commit**

```bash
git add app/routes/app.pixels._index.tsx app/routes/app.tsx e2e/pixels.spec.ts
git commit -m "refactor: move pixel list to /app/pixels; NavMenu Home+Pixels"
```

---

## Task 8: Home dashboard (counts per pixel × event)

**Files:**
- Create: `app/routes/app._index.tsx` (Home)
- Create: `e2e/home.spec.ts`
- Modify: `e2e/global-setup.ts` (also clear `CapiEventLog`)

**Interfaces:**
- Consumes: `countByPixelAndEvent`, `pivotCounts`, `EVENT_NAMES` (Task 2); `listPixels` (pixel.server); `requireAdmin`.
- Produces: Home dashboard at `/app`.

- [ ] **Step 1: Clear CapiEventLog in E2E global setup**

In `e2e/global-setup.ts`, inside the `try`, before/after `pixel.deleteMany`:
```ts
    await prisma.capiEventLog.deleteMany({});
    await prisma.pixel.deleteMany({});
```

- [ ] **Step 2: Write the Home route**

```tsx
// app/routes/app._index.tsx
import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, IndexTable, Text } from "@shopify/polaris";
import { requireAdmin } from "../lib/auth.server";
import { listPixels } from "../models/pixel.server";
import { countByPixelAndEvent, pivotCounts, EVENT_NAMES } from "../models/capiEventLog.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await requireAdmin(request);
  const [counts, pixels] = await Promise.all([
    countByPixelAndEvent(session.shop),
    listPixels(session.shop),
  ]);
  const rows = pivotCounts(
    counts,
    pixels.map((p) => ({ pixelId: p.pixelId, name: p.name })),
  );
  return json({ rows, eventNames: EVENT_NAMES });
};

export default function Home() {
  const { rows, eventNames } = useLoaderData<typeof loader>();
  return (
    <Page title="Home — CAPI events">
      <Card padding="0">
        <IndexTable
          itemCount={rows.length}
          selectable={false}
          headings={[
            { title: "Pixel" },
            ...eventNames.map((n) => ({ title: n })),
            { title: "Total" },
          ]}
          emptyState={<div style={{ padding: 32, textAlign: "center" }}>No CAPI events yet</div>}
        >
          {rows.map((r, i) => (
            <IndexTable.Row id={r.pixelId} key={r.pixelId} position={i}>
              <IndexTable.Cell>
                <Text as="span" fontWeight="medium">
                  {r.name}
                </Text>
              </IndexTable.Cell>
              {eventNames.map((n) => (
                <IndexTable.Cell key={n}>{r.counts[n]}</IndexTable.Cell>
              ))}
              <IndexTable.Cell>
                <Text as="span" fontWeight="medium">
                  {r.total}
                </Text>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    </Page>
  );
}
```

- [ ] **Step 3: Write the Home E2E**

```ts
// e2e/home.spec.ts
import { test, expect } from "@playwright/test";

test("Home renders the CAPI events dashboard", async ({ page }) => {
  await page.goto("/app");
  await expect(page.getByText("Home — CAPI events")).toBeVisible();
  // With a clean E2E DB there are no logged events yet.
  await expect(page.getByText("No CAPI events yet")).toBeVisible();
});
```

- [ ] **Step 4: Run E2E (and the unit suite)**

Run: `npm test` then `npm run test:e2e`
Expected: unit suite passes (incl. Task 2 pivot tests); E2E `home` + `pixels` all green.

- [ ] **Step 5: Commit**

```bash
git add app/routes/app._index.tsx e2e/home.spec.ts e2e/global-setup.ts
git commit -m "feat: Home dashboard with CAPI event counts per pixel x event"
```

---

## Self-Review

**Spec coverage:**
- App Proxy endpoint → Task 5. ✓
- Web pixel forwards events (+fbp/fbc/UA) → Task 6. ✓
- Server CAPI reusing capi.server + fbp/fbc → Tasks 3, 4. ✓
- CapiEventLog model + audit log → Tasks 1, 2, 4. ✓
- Home dashboard (counts per pixel × event), as the index → Task 8. ✓
- Pixel list moved to /app/pixels + NavMenu → Task 7. ✓
- E2E updated to /app/pixels + Home spec → Tasks 7, 8. ✓
- Dedup via shared event_id → Task 4 (uses payload.eventId = browser eid) + Task 6. ✓
- Always-200 proxy + failure logging → Tasks 4, 5. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. The App-Proxy
path mapping (`/apps/fbpixel/capi` → route `capi.tsx`) is verified manually in
Task 5 Step 3; if the CLI maps the path differently, rename the route file to match
(noted, not a hidden placeholder).

**Type consistency:** `CapiPayload` (Task 4) matches the proxy body (Task 5) and the
web-pixel POST body (Task 6). `CapiLogInput` (Task 2) matches `logCapiEvent` calls
(Task 4). `pivotCounts`/`countByPixelAndEvent`/`EVENT_NAMES` (Task 2) match the Home
loader (Task 8). `buildEvent` fbp/fbc (Task 3) match `handleCapiEvent`'s call (Task 4). ✓

> **Note on coverage:** Tasks 1–4 + 8 are unit-tested (model, buildEvent, handler,
> pivot) and E2E-tested (Home). Task 5 (proxy auth) and Task 6 (sandbox web pixel)
> depend on Shopify runtime/storefront and are verified manually on a dev store.
