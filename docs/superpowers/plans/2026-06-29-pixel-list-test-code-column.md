# Pixel List — Test Event Code Column + Setup Modal — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Test code event" column to the pixel list with a Setup button (enabled only for CAPI pixels) that opens a modal to set the pixel's Facebook test event code.

**Architecture:** A new IndexTable column shows each pixel's `testEventCode` (or "Not set" / "—") and a Setup `<Button>`. Clicking it opens a Polaris `<Modal>` with a pre-filled `<TextField>`; Save posts `_action=setTestCode` to the existing list `action`, which calls `updatePixel(shop, id, { testEventCode })`. All in one route file plus an E2E spec.

**Tech Stack:** Remix, Polaris React, Prisma + MySQL, Playwright (E2E) with the `requireAdmin` shim.

## Global Constraints

- TDD red-green: write the failing E2E spec first, watch it fail, then implement.
- Setup button shows for ALL pixels but is **disabled** when `!capiEnabled`.
- Empty field on Save clears the code (`testEventCode: null`).
- No model change — `updatePixel` already persists `testEventCode`; no token validation on this path.
- The list route's action returns `{ ok, op }` consumed by the existing `fetcher` + toast effect.
- Pixel list lives at `app/routes/app.pixels._index.tsx`; E2E navigates to `/app/pixels`.

---

## Task 1: Test code column + Setup modal + action

**Files:**
- Modify: `app/routes/app.pixels._index.tsx`
- Modify: `e2e/pixels.spec.ts`

**Interfaces:**
- Consumes: `updatePixel` from `app/models/pixel.server.ts` (already exported); `PixelView.testEventCode` / `.capiEnabled`.
- Produces: a `setTestCode` action op + the new column/modal UI.

- [ ] **Step 1: Write the failing E2E spec — append to `e2e/pixels.spec.ts`**

```ts
test("set a test event code via the Setup modal", async ({ page }) => {
  const id = uniqueId(7);
  // A CAPI-enabled pixel so the Setup button is enabled.
  await page.getByRole("link", { name: "Add pixel" }).click();
  await page.getByLabel("Pixel name").fill("TestCode Pixel");
  await page.getByLabel("Pixel ID").fill(id);
  await page.getByRole("checkbox", { name: "Enable CAPI" }).check();
  await page.getByLabel("Facebook access token").fill("test-token");
  await page.getByRole("button", { name: "Save pixel" }).click();
  await expect(page.getByText("TestCode Pixel")).toBeVisible();

  await page.getByRole("button", { name: "Setup" }).first().click();
  await page.getByLabel("Test event code").fill("TEST99");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText("TEST99")).toBeVisible();
});
```

- [ ] **Step 2: Run, expect FAIL** (no Setup button yet)

Run: `npm run test:e2e -- pixels`
Expected: the new spec FAILS at `getByRole("button", { name: "Setup" })` (timeout). The other specs still pass.

- [ ] **Step 3: Add the `setTestCode` op to the route `action`**

In `app/routes/app.pixels._index.tsx`, import `updatePixel` (extend the existing model import to `import { listPixels, deletePixel, updatePixel } from "../models/pixel.server";`) and replace the `action` body's `try` block with:
```tsx
  const op = String(form.get("_action"));
  try {
    if (op === "delete") {
      await deletePixel(session.shop, id);
      await syncWebPixel(admin, session.shop).catch((e) => console.error("syncWebPixel", e));
    } else if (op === "setTestCode") {
      await updatePixel(session.shop, id, {
        testEventCode: String(form.get("testEventCode") ?? "") || null,
      });
    }
    return json({ ok: true, op });
  } catch (e: any) {
    return json({ ok: false, error: e.message }, { status: 400 });
  }
```

- [ ] **Step 4: Add the toast label + modal state**

In the component, in the toast `map` (the `useEffect` on `fetcher.data`) add the entry:
```tsx
        delete: "Pixel deleted",
        setTestCode: "Test code updated",
```
Add state near the existing `deleteId`:
```tsx
  const [setupId, setSetupId] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
```

- [ ] **Step 5: Add the column heading + cell**

In the `<IndexTable headings={[...]}>`, insert between "Is CAPI" and "Actions":
```tsx
              { title: "Test code event" },
```
In each `<IndexTable.Row>`, insert this cell between the "Is CAPI" badge cell and the "Actions" cell:
```tsx
                <IndexTable.Cell>
                  <InlineStack gap="200" blockAlign="center">
                    {p.capiEnabled ? (
                      <Text as="span" tone={p.testEventCode ? undefined : "subdued"}>
                        {p.testEventCode ? <code>{p.testEventCode}</code> : "Not set"}
                      </Text>
                    ) : (
                      <Text as="span" tone="subdued">
                        —
                      </Text>
                    )}
                    <Button
                      disabled={!p.capiEnabled}
                      onClick={() => {
                        setSetupId(p.id);
                        setSetupCode(p.testEventCode ?? "");
                      }}
                    >
                      Setup
                    </Button>
                  </InlineStack>
                </IndexTable.Cell>
```

- [ ] **Step 6: Add the Setup modal**

Next to the existing delete `<Modal>` (inside the same `<Page>`/`<Frame>`), add:
```tsx
        <Modal
          open={setupId !== null}
          onClose={() => setSetupId(null)}
          title="Set up test event code"
          primaryAction={{
            content: "Save",
            onAction: () => {
              if (setupId)
                submit({ _action: "setTestCode", id: setupId, testEventCode: setupCode });
              setSetupId(null);
            },
          }}
          secondaryActions={[{ content: "Cancel", onAction: () => setSetupId(null) }]}
        >
          <Modal.Section>
            <TextField
              label="Test event code"
              value={setupCode}
              onChange={setSetupCode}
              maxLength={20}
              autoComplete="off"
              placeholder="e.g. TEST12345"
            />
          </Modal.Section>
        </Modal>
```
(`Modal`, `TextField`, `Button`, `InlineStack`, `Text` are already imported in this file.)

- [ ] **Step 7: Run E2E — expect GREEN**

Run: `npm run test:e2e` (kill a stale port-3000 server first if needed)
Expected: all specs PASS, including "set a test event code via the Setup modal".

- [ ] **Step 8: Commit**

```bash
git add app/routes/app.pixels._index.tsx e2e/pixels.spec.ts
git commit -m "feat: pixel list test-code column + Setup modal"
```

---

## Self-Review

**Spec coverage:**
- Column between Is CAPI and Actions → Step 5. ✓
- CAPI pixel: code / "Not set" + enabled Setup → Step 5. ✓
- Non-CAPI: "—" + disabled Setup → Step 5. ✓
- Setup modal, pre-filled, maxLength 20 → Step 6. ✓
- Empty = clear (`|| null`) → Step 3. ✓
- `setTestCode` → `updatePixel`, toast "Test code updated" → Steps 3, 4. ✓
- E2E spec → Step 1. ✓
- No model change / no unit test → Global Constraints (updatePixel already handles it). ✓

**Placeholder scan:** No TBD/TODO; every step has full code.

**Type consistency:** `setupId`/`setupCode` state and `submit({ _action:"setTestCode", id, testEventCode })` match the action's `op === "setTestCode"` + `form.get("testEventCode")`. The toast key `setTestCode` matches the returned `op`. `p.testEventCode`/`p.capiEnabled` exist on `PixelView`. ✓
