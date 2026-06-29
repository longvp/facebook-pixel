# Pixel List — Test Event Code Column + Setup Modal (Design)

- **Date**: 2026-06-29
- **Status**: Approved (design)
- **Builds on**: the existing pixel list at `/app/pixels`.

## 1. Purpose

Let a merchant set a Facebook **test event code** for a pixel directly from the
pixel list, via a "Setup" button that opens a small modal — without going into
the full edit form. The test event code routes CAPI events to Meta's Test Events
tab, so it only applies to CAPI-enabled pixels.

## 2. Decisions

| Area | Decision |
|------|----------|
| New column | "Test code event" between **Is CAPI** and **Actions** |
| Cell — CAPI pixel | Current `testEventCode` (or "Not set") + **Setup** button (enabled) |
| Cell — non-CAPI pixel | "—" + **Setup** button **disabled** |
| Setup action | Opens a modal with a pre-filled text field; Save persists |
| Clearing | Empty field on Save removes the code (`null`) |
| Model | No change — `updatePixel` already handles `testEventCode` |

## 3. Column (`app/routes/app.pixels._index.tsx`)

Columns become: **Pixel ID · Pixel name · Is CAPI · Test code event · Actions**.

Each row's "Test code event" cell:
- If `p.capiEnabled`: show `p.testEventCode` (monospace) or the muted text
  "Not set" when empty, next to a `<Button>Setup</Button>`.
- Else: show "—" next to a `<Button disabled>Setup</Button>`.

## 4. Setup Modal

A Polaris `<Modal>` titled "Set up test event code":
- Body: a `<TextField label="Test event code" maxLength={20}>` pre-filled with the
  selected pixel's current `testEventCode`.
- `primaryAction` "Save" → submits; `secondaryActions` "Cancel" → close.
- Empty value on Save clears the code.

State in the list component: `setupId` (the pixel whose modal is open, or null)
and `setupCode` (the field value). Clicking Setup sets both; Save submits and
closes; Cancel just closes.

## 5. Save / Data Flow

Add a `setTestCode` branch to the list route `action`:
```ts
if (op === "setTestCode") {
  await updatePixel(session.shop, id, {
    testEventCode: String(form.get("testEventCode") ?? "") || null,
  });
}
```
Return `json({ ok: true, op: "setTestCode" })`; the existing toast effect shows
"Test code updated". The loader revalidates so the new value renders in the cell.
No token validation (test code change doesn't touch the token).

## 6. Testing

- **E2E (Playwright)** — add a spec: create a CAPI-enabled pixel, click its
  **Setup**, enter a code (e.g. "TEST99"), Save, assert the code shows in the
  row. (Runs under E2E with no network — `updatePixel` is a plain DB write.)
- No new unit test: `updatePixel` already persists `testEventCode`; the route is
  covered by E2E.

## 7. Out of Scope (YAGNI)

- Validating the test code format (Meta accepts any string).
- A separate "Clear" button (empty + Save already clears).
