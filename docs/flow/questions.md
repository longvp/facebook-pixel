# Open Questions — Facebook Pixel & CAPI Manager

Items classified **discuss**: blocked on a product/technical decision. Resolve
before they block the tasks listed. Current stub keeps everything compiling.

> Resolved/removed: the page-picker question (former Q-1) is gone — page-level
> tracking selection was dropped from scope. Every active pixel tracks all pages.

---

## Q-1: Test event code — persist or transient?
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

## Q-2 (from C-2): Web Pixel active-pixel delivery
**Blocks:** T14 correctness.
**Question:** How do active pixel IDs reach the sandboxed extension?

**Options**
- **A. Push into extension `settings`** when pixels change (via Admin API). *(Recommended v1.)*
- **B. Extension fetches** active pixels from a public app endpoint at runtime.

**Recommendation:** A for v1; measure propagation latency before considering B.
