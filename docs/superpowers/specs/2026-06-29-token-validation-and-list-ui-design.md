# CAPI Token Validation on Save + Pixel List UI Tweaks (Design)

- **Date**: 2026-06-29
- **Status**: Approved (design)
- **Builds on**: the existing Facebook Pixel & CAPI app.

## 1. Purpose

Two changes:
1. **Validate the CAPI access token when saving a pixel.** Currently the token is
   only stored (encrypted) — an invalid token silently breaks every CAPI event.
   On save (when CAPI is enabled and a token is provided), send a test PageView to
   the Meta Graph API; if Meta returns an error, **block the save** and show the
   error.
2. **Simplify the pixel list table.** Remove the Active and Conversion API
   columns; make Edit/Delete Polaris Buttons; confirm deletes with a modal.

## 2. Decisions

| Area | Decision |
|------|----------|
| Invalid token on save | **Block save** + show Meta's error message |
| When to validate | Only when `capiEnabled && a token is provided` (new or changed) |
| Active toggling | **Dropped** — pixels are always active (`active` stays `true` in DB) |
| Edit button | Polaris `<Button url=...>` (secondary/default; renders as a link) |
| Delete button | Polaris `<Button variant="primary">` |
| Delete confirm | Modal titled **"Do you want to delete"**, confirm "Delete" + "Cancel" |

## 3. Token Validation

- New `validateCapiToken(pixelId: string, token: string, testEventCode?: string|null): Promise<{ ok: boolean; error?: string }>` in `app/lib/capi.server.ts`.
  - Builds a minimal PageView (`buildEvent({ eventName:"PageView", eventTime: now, eventId:"validate-<ts>" })`) and calls `sendEvents`.
  - `ok: true` when the Graph response is ok; otherwise `ok:false` with
    `error` = the Meta error message (`body.error.message`) or a generic fallback.
  - **E2E bypass:** when `process.env.E2E === "1"`, skip the network call and
    return `{ ok: true }` (same pattern as the `requireAdmin` shim).
- `app/routes/app.pixels.new.tsx` and `app/routes/app.pixels.$id.tsx` actions:
  when `capiEnabled === true` and a non-empty `accessToken` was submitted, call
  `validateCapiToken` **before** `createPixel`/`updatePixel`. If `!ok`, return
  `json({ error }, { status: 400 })` (the shared `PixelForm` already renders a
  critical Banner from `error`). On edit, if the token field is left blank (keep
  existing token), skip validation.

## 4. Pixel List UI (`app/routes/app.pixels._index.tsx`)

- **Remove** the Active column (toggle) and the Conversion API column (toggle),
  and the `toggleActive` / `toggleCapi` branches in the route `action` (keep
  `delete`). `active` remains in the DB defaulting to `true`.
- Columns: **Pixel ID · Pixel name · Actions**.
- Actions cell:
  - Edit: `<Button url={`/app/pixels/${p.id}`}>Edit</Button>`.
  - Delete: `<Button variant="primary" onClick={() => setDeleteId(p.id)}>Delete</Button>`.
- Delete modal:
  ```tsx
  <Modal open={deleteId !== null} onClose={...} title="Do you want to delete"
    primaryAction={{ content: "Delete", destructive: true, onAction: confirmDelete }}
    secondaryActions={[{ content: "Cancel", onAction: cancel }]}>
    <Modal.Section><Text as="p">This pixel will be permanently removed.</Text></Modal.Section>
  </Modal>
  ```
- Keep the existing search box + Toast feedback.

## 5. Testing

- **Unit (Vitest):** `validateCapiToken` — ok path and error path (mock `sendEvents`;
  assert the Meta error message is extracted).
- **E2E (Playwright):**
  - **Remove** `US-6` (toggle active) and `US-7` (toggle CAPI on list) — those
    controls no longer exist.
  - `US-4` (Pixel ID immutable): unchanged — Edit (`<Button url>`) still has
    `role="link"`.
  - `US-5` (delete): update to the new modal — click row "Delete" → assert
    "Do you want to delete" visible → click the dialog's confirm button →
    the pixel row is gone.
  - The token-validation failure path is covered by the unit test (E2E bypasses
    the network), so CAPI saves still pass in E2E.
- TDD red-green per project rules.

## 6. Out of Scope (YAGNI)

- Removing `setActive`/`setCapiEnabled` from the model (now unused but harmless
  and tested) — left as-is, no unrelated refactor.
- Dropping the `active` column via migration — kept (always `true`).
- A dedicated "validate token" button separate from save.
