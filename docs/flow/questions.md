# Open Questions — Facebook Pixel & CAPI Manager

Items classified **discuss**: blocked on a product/technical decision. Resolve
before they block the tasks listed. Current stub keeps everything compiling.

---

## Q-1: Page picker for Selected / Excluded tracking modes
**Blocks:** US-8; full correctness of T8 (model), T10–T12 (UI), T14 (extension).
**Current stub:** `trackingPages` persists as `[]`; SELECTED/EXCLUDED behave like ALL.

**Question:** How does the merchant choose which pages a pixel tracks/excludes?

**Options**
- **A. Page-type checklist** — fixed set: Home, Product, Collection, Cart,
  Checkout, Search, Blog, Other. Simplest; no data fetch. *(Recommended for v1.)*
- **B. Specific URLs/handles** — free-text or autocomplete of actual store pages
  (needs Admin API to list pages/products). Most precise; more work.
- **C. URL path patterns** — merchant enters glob/regex paths (e.g. `/products/*`).
  Flexible but error-prone for non-technical merchants.

**Recommendation:** A for v1, with the data stored as a string[] of page-type keys
so we can migrate to B later without a schema change.

---

## Q-2: Test event code — persist or transient?
**Blocks:** US-7 detail; behavior of T8/T11/T12 around `testEventCode`.
**Current state:** model has a `testEventCode` column; the mockup clears it on edit.

**Question:** Should the Test event code be stored long-term or treated as testing-only?

**Options**
- **A. Persist** — store and reuse until the merchant clears it. Convenient for
  ongoing testing; risk of shipping test traffic to production if forgotten.
- **B. Transient** — accept it for a manual "send test event" action only; never
  store. Safest; merchant re-enters each test. *(Recommended.)*
- **C. Persist + auto-expire** — store with a visible reminder/expiry banner.
  Middle ground; more UI work.

**Recommendation:** B — keep the column for now but do not surface it as a
persisted setting; wire it only into a future "Send test event" action. Until
decided, the form writes whatever is entered (matches current plan).

---

## Q-3 (from C-2): Web Pixel active-pixel delivery
**Blocks:** T14 correctness.
**Question:** How do active pixel IDs reach the sandboxed extension?

**Options**
- **A. Push into extension `settings`** when pixels change (via Admin API). *(Recommended v1.)*
- **B. Extension fetches** active pixels from a public app endpoint at runtime.

**Recommendation:** A for v1; measure propagation latency before considering B.
