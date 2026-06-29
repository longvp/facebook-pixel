# CAPI Token Validation on Save + Pixel List UI — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Validate the Facebook CAPI access token when saving a pixel (send a test PageView; block the save on a Meta error), and simplify the pixel list table (drop Active/Conversion-API columns; Polaris Buttons for Edit/Delete; a "Do you want to delete" confirm modal).

**Architecture:** A new `validateCapiToken` in `app/lib/capi.server.ts` sends a test PageView via the existing `sendEvents` and reports Meta's error (bypassed under `E2E=1`). The add/edit route actions call it before persisting. The list route drops the two toggle columns and their action branches.

**Tech Stack:** Remix, Polaris React, Prisma + MySQL, Vitest (unit) + Playwright (E2E) with the `requireAdmin` E2E shim.

## Global Constraints

- TDD red-green: failing test first, then implement (CLAUDE.md rule).
- Validate only when `capiEnabled === true` AND a non-empty `accessToken` was submitted. On edit with a blank token (keep existing), skip validation.
- Invalid token → **block the save**, return `json({ error }, { status: 400 })`; the shared `PixelForm` renders `error` in a critical Banner.
- `validateCapiToken` returns `{ ok: true }` immediately when `process.env.E2E === "1"` (no network in E2E) — same pattern as `requireAdmin`.
- Pixels are always active: keep the `active` DB column (defaults `true`); just remove the UI toggle. Do NOT remove `setActive`/`setCapiEnabled` from the model.
- Reuse `buildEvent`/`sendEvents` from `app/lib/capi.server.ts`.
- The pixel list lives at `app/routes/app.pixels._index.tsx` (already moved to `/app/pixels`).

---

## File Structure

- `app/lib/capi.server.ts` — add `validateCapiToken`.
- `app/lib/capi.server.test.ts` — add `validateCapiToken` tests.
- `app/routes/app.pixels.new.tsx` — validate before `createPixel`.
- `app/routes/app.pixels.$id.tsx` — validate before `updatePixel` (needs the pixel's `pixelId`, since the disabled field isn't submitted).
- `app/routes/app.pixels._index.tsx` — drop Active/CAPI columns + toggle action branches; Edit/Delete Buttons; new modal title.
- `e2e/pixels.spec.ts` — remove US-6/US-7; update US-5; add a "save with CAPI" spec.

---

## Task 1: `validateCapiToken`

**Files:**
- Modify: `app/lib/capi.server.ts`
- Modify: `app/lib/capi.server.test.ts`

**Interfaces:**
- Consumes: existing `buildEvent`, `sendEvents` (same module).
- Produces: `validateCapiToken(pixelId: string, token: string, testEventCode?: string | null): Promise<{ ok: boolean; error?: string }>`. Sends a test PageView; `{ok:true}` if accepted (or under E2E); otherwise `{ok:false, error: <Meta message>}`.

- [ ] **Step 1: Add the failing tests (append inside `app/lib/capi.server.test.ts`)**

Add a new top-level block after the existing `describe("capi", ...)`:
```ts
import { validateCapiToken } from "./capi.server";

describe("validateCapiToken", () => {
  beforeEach(() => {
    delete process.env.E2E;
  });

  it("returns ok when the test event is accepted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 })),
    );
    expect(await validateCapiToken("PIX", "tok")).toEqual({ ok: true });
  });

  it("returns the Meta error message when rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ error: { message: "Invalid OAuth access token." } }), {
            status: 400,
          }),
      ),
    );
    const r = await validateCapiToken("PIX", "tok");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Invalid OAuth access token");
  });

  it("skips the network and returns ok under E2E", async () => {
    process.env.E2E = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await validateCapiToken("PIX", "tok")).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
```
(If `beforeEach` / `Response` are not already imported in the file, add `beforeEach` to the `vitest` import. `Response` is a global.)

- [ ] **Step 2: Run, expect FAIL** (`validateCapiToken` not exported): `npm test -- capi.server`

- [ ] **Step 3: Implement — append to `app/lib/capi.server.ts`**

```ts
export async function validateCapiToken(
  pixelId: string,
  token: string,
  testEventCode?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  // No network in E2E — the requireAdmin shim pattern.
  if (process.env.E2E === "1") return { ok: true };

  const event = buildEvent({
    eventName: "PageView",
    eventTime: Math.floor(Date.now() / 1000),
    eventId: `validate-${Date.now()}`,
  });
  const res = await sendEvents(pixelId, token, [event], testEventCode);
  if (res.ok) return { ok: true };
  const message =
    res.body?.error?.message || `Token validation failed (status ${res.status})`;
  return { ok: false, error: message };
}
```

- [ ] **Step 4: Run, expect PASS** (existing capi tests + 3 new): `npm test -- capi.server`

- [ ] **Step 5: Commit**

```bash
git add app/lib/capi.server.ts app/lib/capi.server.test.ts
git commit -m "feat: add validateCapiToken (test PageView, E2E bypass)"
```

---

## Task 2: Validate token in the add/edit actions

**Files:**
- Modify: `app/routes/app.pixels.new.tsx`
- Modify: `app/routes/app.pixels.$id.tsx`

**Interfaces:**
- Consumes: `validateCapiToken` (Task 1); existing `createPixel`/`updatePixel`/`getPixel`.
- Produces: a 400 `{ error }` when CAPI is enabled with an invalid token, before persisting.

- [ ] **Step 1: Wire validation into the `new` action.** In `app/routes/app.pixels.new.tsx`, add the import and the validation block. The action currently reads form fields and calls `createPixel`. Replace the body of the `try` so it validates first:

```tsx
import { validateCapiToken } from "../lib/capi.server";
```
```tsx
  try {
    const capiEnabled = f.get("capiEnabled") === "true";
    const accessToken = (f.get("accessToken") as string) || undefined;
    const testEventCode = (f.get("testEventCode") as string) || null;
    const pixelId = String(f.get("pixelId") ?? "");

    if (capiEnabled && accessToken) {
      const v = await validateCapiToken(pixelId, accessToken, testEventCode);
      if (!v.ok) return json({ error: v.error }, { status: 400 });
    }

    await createPixel(session.shop, {
      name: String(f.get("name") ?? ""),
      pixelId,
      capiEnabled,
      accessToken,
      testEventCode,
    });
    await syncWebPixel(admin, session.shop).catch((e) => console.error("syncWebPixel", e));
    return redirect("/app/pixels");
  } catch (e: any) {
    return json({ error: e.message }, { status: 400 });
  }
```

- [ ] **Step 2: Wire validation into the `$id` (edit) action.** In `app/routes/app.pixels.$id.tsx`, add the import; the edit form's Pixel ID field is **disabled** (not submitted), so fetch the pixel to get its `pixelId`:

```tsx
import { validateCapiToken } from "../lib/capi.server";
```
```tsx
  try {
    const capiEnabled = f.get("capiEnabled") === "true";
    const accessToken = (f.get("accessToken") as string) || undefined;
    const testEventCode = (f.get("testEventCode") as string) || null;

    if (capiEnabled && accessToken) {
      const existing = await getPixel(session.shop, params.id!);
      if (!existing) throw new Error("Pixel not found");
      const v = await validateCapiToken(existing.pixelId, accessToken, testEventCode);
      if (!v.ok) return json({ error: v.error }, { status: 400 });
    }

    await updatePixel(session.shop, params.id!, {
      name: String(f.get("name") ?? ""),
      capiEnabled,
      accessToken,
      testEventCode,
    });
    await syncWebPixel(admin, session.shop).catch((e) => console.error("syncWebPixel", e));
    return redirect("/app/pixels");
  } catch (e: any) {
    return json({ error: e.message }, { status: 400 });
  }
```
(`getPixel` is already imported in this file for the loader.)

- [ ] **Step 3: Verify it builds**

Run: `npm run build`
Expected: build succeeds (a Polaris CSS `print` warning is harmless).

- [ ] **Step 4: Commit**

```bash
git add app/routes/app.pixels.new.tsx app/routes/app.pixels.$id.tsx
git commit -m "feat: validate CAPI token before saving a pixel"
```

---

## Task 3: Pixel list UI + E2E updates

**Files:**
- Modify: `app/routes/app.pixels._index.tsx`
- Modify: `e2e/pixels.spec.ts`

**Interfaces:**
- Produces: a list with **Pixel ID · Pixel name · Actions** only; Edit (`<Button url>`) + Delete (`<Button variant="primary">`); a "Do you want to delete" modal.

- [ ] **Step 1: Trim the route `action` to only handle delete.** In `app/routes/app.pixels._index.tsx`, the action currently branches on `toggleActive`/`toggleCapi`/`delete`. Replace it with delete-only:
```tsx
export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await requireAdmin(request);
  const form = await request.formData();
  const id = String(form.get("id"));
  try {
    if (String(form.get("_action")) === "delete") await deletePixel(session.shop, id);
    return json({ ok: true, op: "delete" });
  } catch (e: any) {
    return json({ ok: false, error: e.message }, { status: 400 });
  }
};
```
Remove the now-unused `setActive`/`setCapiEnabled` from the import (keep `listPixels`, `deletePixel`).

- [ ] **Step 2: Remove the two columns + change the Actions cell.** In the `<IndexTable>`, set headings to:
```tsx
            headings={[
              { title: "Pixel ID" },
              { title: "Pixel name" },
              { title: "Actions" },
            ]}
```
Replace each row's cells (drop the Active checkbox cell and the Conversion API checkbox cell) so a row is:
```tsx
              <IndexTable.Row id={p.id} key={p.id} position={i}>
                <IndexTable.Cell>
                  <Text as="span" tone="subdued">
                    <code>{p.pixelId}</code>
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="medium">
                    {p.name}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <InlineStack gap="200">
                    <Button url={`/app/pixels/${p.id}`}>Edit</Button>
                    <Button variant="primary" onClick={() => setDeleteId(p.id)}>
                      Delete
                    </Button>
                  </InlineStack>
                </IndexTable.Cell>
              </IndexTable.Row>
```
Remove the now-unused `Checkbox` and `PolarisLink` imports (keep `Button`, `InlineStack`, `Text`, etc.). Remove the `toggleActive: "Pixel updated"` / `toggleCapi: "CAPI updated"` entries from the toast `map` (keep `delete: "Pixel deleted"`).

- [ ] **Step 3: Update the delete modal title.** Change the `<Modal ... title="Delete pixel?" ...>` to `title="Do you want to delete"` and keep the destructive primary action `content: "Delete"` + secondary `Cancel`. Example:
```tsx
        <Modal
          open={deleteId !== null}
          onClose={() => setDeleteId(null)}
          title="Do you want to delete"
          primaryAction={{
            content: "Delete",
            destructive: true,
            onAction: () => {
              if (deleteId) submit({ _action: "delete", id: deleteId });
              setDeleteId(null);
            },
          }}
          secondaryActions={[{ content: "Cancel", onAction: () => setDeleteId(null) }]}
        >
          <Modal.Section>
            <Text as="p">This pixel will be permanently removed. This action cannot be undone.</Text>
          </Modal.Section>
        </Modal>
```

- [ ] **Step 4: Update the E2E specs `e2e/pixels.spec.ts`.**
  (a) **Delete** the entire `US-6: toggle a pixel inactive` test and the entire `US-7: enabling CAPI without a token is rejected` test (those controls no longer exist on the list).
  (b) Replace the `US-5` delete test body with the new modal (the row "Delete" button and the modal "Delete" button share a name, so scope the confirm to the dialog):
```ts
test("US-5: delete asks for confirmation", async ({ page }) => {
  const id = uniqueId(4);
  await page.getByRole("link", { name: "Add pixel" }).click();
  await page.getByLabel("Pixel name").fill("To Delete");
  await page.getByLabel("Pixel ID").fill(id);
  await page.getByRole("button", { name: "Save pixel" }).click();
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText("Do you want to delete")).toBeVisible();
  await page.getByRole("dialog").getByRole("button", { name: "Delete" }).click();
  await expect(page.getByText("To Delete")).toHaveCount(0);
});
```
  (c) Add a spec covering a CAPI-enabled save (validation is bypassed under E2E, so it succeeds and lands back on the list):
```ts
test("save a pixel with CAPI enabled + token", async ({ page }) => {
  const id = uniqueId(9);
  await page.getByRole("link", { name: "Add pixel" }).click();
  await page.getByLabel("Pixel name").fill("Capi Pixel");
  await page.getByLabel("Pixel ID").fill(id);
  await page.getByRole("checkbox", { name: "Enable CAPI" }).check();
  await page.getByLabel("Facebook access token").fill("test-token");
  await page.getByRole("button", { name: "Save pixel" }).click();
  await expect(page.getByText("Capi Pixel")).toBeVisible();
});
```

- [ ] **Step 5: Run unit + E2E**

Run: `npm test`
Expected: all unit tests pass (incl. Task 1's validateCapiToken).
Run: `npm run test:e2e`
Expected: green — US-1, US-2, US-3, US-4, US-5 (updated), the new CAPI-save spec, and the Home spec. (US-6/US-7 removed.) If a stale dev server on port 3000 interferes, kill it and re-run.

- [ ] **Step 6: Commit**

```bash
git add app/routes/app.pixels._index.tsx e2e/pixels.spec.ts
git commit -m "feat: simplify pixel list (drop Active/CAPI cols, Button actions, delete modal)"
```

---

## Self-Review

**Spec coverage:**
- Token validation function + Meta error + E2E bypass → Task 1. ✓
- Validate on save (new + edit, only when capiEnabled+token; edit fetches pixelId since field disabled) → Task 2. ✓
- Block save on invalid token → Tasks 1/2 (400 + Banner). ✓
- Remove Active + Conversion API columns + toggle action branches → Task 3 Steps 1–2. ✓
- Edit = `<Button url>`, Delete = `<Button variant="primary">` → Task 3 Step 2. ✓
- Delete modal "Do you want to delete" → Task 3 Step 3. ✓
- Remove US-6/US-7, update US-5 → Task 3 Step 4. ✓
- `active` kept in DB (always true); no model refactor → Global Constraints / Task 3 Step 1. ✓

**Placeholder scan:** No TBD/TODO; every code step has full code.

**Type consistency:** `validateCapiToken(pixelId, token, testEventCode?)` (Task 1) matches both call sites (Task 2). The list `action` still returns `{ ok, op }` / `{ ok:false, error }` consumed by the existing `fetcher`/toast effect (unchanged shape). The new modal keeps the `deleteId`/`submit` state already in the file. ✓

> **Note:** Task 1 is unit-tested. Task 2 (wiring) is build-checked; its happy path is exercised by Task 3's "save with CAPI" E2E (validation bypassed under E2E). The invalid-token block path is unit-tested in Task 1, not E2E (E2E never hits Meta).
