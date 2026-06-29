# Verification — Facebook Pixel & CAPI Manager

Verify phase (TDD): every user-story acceptance criterion maps to an automated
test, or is flagged for manual dev-store verification where the browser/Facebook
boundary can't be reached headlessly.

## Evidence — commands run

**Unit (Vitest):**
```
$ npm test
 Test Files  4 passed (4)
      Tests  10 passed (10)
```
Files: `crypto.server.test.ts` (2), `capi.server.test.ts` (3),
`pixel.server.test.ts` (2), `webPixel.server.test.ts` (3).

**E2E (Playwright, headless Chromium against the running app):**
```
$ npx playwright test
  7 passed (10.6s)
```
Specs: US-1/US-3, US-3, US-4, US-7, US-5, US-2, US-6.

---

## Coverage map

| Story | Acceptance criterion | Test | Status |
|-------|----------------------|------|--------|
| US-1 | List shows pixels with the right columns; empty state | E2E `US-1/US-3`, `US-2`, `US-6` (list renders + rows) | ✅ pass |
| US-2 | Search filters by name/ID | E2E `US-2: search filters the list` | ✅ pass |
| US-3 | Add pixel; appears in list | E2E `US-1/US-3: add a pixel…` | ✅ pass |
| US-3 | Name + Pixel ID required | E2E `US-3: name + Pixel ID are required` | ✅ pass |
| US-4 | Edit; **Pixel ID immutable** | E2E `US-4: Pixel ID is immutable on edit` | ✅ pass |
| US-5 | Delete with confirmation modal; row removed | E2E `US-5: delete asks for confirmation` | ✅ pass |
| US-6 | Toggle active/inactive persists | E2E `US-6: toggle a pixel inactive` | ✅ pass |
| US-7 | Enabling CAPI without a token is rejected | E2E `US-7…` + unit `pixel model › refuses to enable CAPI without a stored token` | ✅ pass |
| US-7 | Access token encrypted at rest | unit `crypto › round-trips` + `random IV` | ✅ pass |
| US-9 | CAPI event: PII hashed, event_id, POST to Graph API | unit `capi › hashes PII`, `builds event`, `POSTs to graph endpoint` | ✅ pass (logic) |
| US-8 | Web pixel activation (create/update with active IDs) | unit `syncWebPixel › no-op / create+store / update` | ✅ pass (logic) |

## Manual verification required (dev store)

These cross the browser/storefront/Facebook boundary and can't be asserted
headlessly; verify on a development store with `shopify app dev`:

- **US-8 (browser Web Pixel):** on the storefront, page view / add-to-cart /
  checkout fire `https://www.facebook.com/tr/?...&eid=order-<id>` for each active
  pixel. Check the Network tab or Meta Events Manager → Test events. The web pixel
  is activated automatically by `syncWebPixel` when pixels change.
- **US-9 (server Purchase via webhook):** `orders/create` → server CAPI Purchase
  with matching `event_id=order-<id>` (dedup with the browser event).
  **Currently blocked:** the `orders/create` webhook + `read_orders` scope are
  temporarily disabled in `shopify.app.toml` until **Protected customer data
  access** is granted in the Partner Dashboard. Re-enable (uncomment) afterward;
  the handler `app/routes/webhooks.orders.create.tsx` is ready.

## Notes
- Pre-existing template type warning in `app/shopify.server.ts` (duplicate
  `@shopify/shopify-api` in node_modules) is unrelated to app code; `npm run build`
  and all tests are unaffected.
- E2E runs the app via a test-mode auth shim (`requireAdmin`, `E2E=1`) and a
  Polaris-only `app.tsx` branch (no App Bridge), against a dedicated
  `facebook_pixel_e2e` database reset by `e2e/global-setup.ts`.
