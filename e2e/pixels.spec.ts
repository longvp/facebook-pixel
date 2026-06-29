import { test, expect } from "@playwright/test";

const uniqueId = (i: number) => `99${i}${Date.now().toString().slice(-7)}`;

test.beforeEach(async ({ page }) => {
  await page.goto("/app");
});

test("US-1/US-3: add a pixel, then it appears in the list", async ({
  page,
}) => {
  const id = uniqueId(1);
  await page.getByRole("link", { name: "Add pixel" }).click();
  await page.getByLabel("Pixel name").fill("My Test Pixel");
  await page.getByLabel("Pixel ID").fill(id);
  await page.getByRole("button", { name: "Save pixel" }).click();
  await expect(page.getByText("My Test Pixel")).toBeVisible();
  await expect(page.getByText(id)).toBeVisible();
});

test("US-3: name + Pixel ID are required", async ({ page }) => {
  await page.getByRole("link", { name: "Add pixel" }).click();
  await page.getByRole("button", { name: "Save pixel" }).click();
  // stays on the form (no redirect to the list)
  await expect(page.getByRole("button", { name: "Save pixel" })).toBeVisible();
});

test("US-4: Pixel ID is immutable on edit", async ({ page }) => {
  const id = uniqueId(2);
  await page.getByRole("link", { name: "Add pixel" }).click();
  await page.getByLabel("Pixel name").fill("Editable");
  await page.getByLabel("Pixel ID").fill(id);
  await page.getByRole("button", { name: "Save pixel" }).click();
  await page.getByRole("link", { name: "Edit" }).first().click();
  await expect(page.getByLabel("Pixel ID")).toBeDisabled();
});

test("US-7: enabling CAPI without a token is rejected", async ({ page }) => {
  const id = uniqueId(3);
  await page.getByRole("link", { name: "Add pixel" }).click();
  await page.getByLabel("Pixel name").fill("No Token");
  await page.getByLabel("Pixel ID").fill(id);
  await page.getByRole("button", { name: "Save pixel" }).click();
  // toggle CAPI on the list row → warning, stays disabled (so use click, not
  // check: the checkbox reverts to unchecked because CAPI can't be enabled)
  const capiToggle = page.getByRole("checkbox", { name: "CAPI" }).first();
  await capiToggle.click();
  await expect(page.getByText(/access token/i)).toBeVisible();
});

test("US-5: delete asks for confirmation", async ({ page }) => {
  const id = uniqueId(4);
  await page.getByRole("link", { name: "Add pixel" }).click();
  await page.getByLabel("Pixel name").fill("To Delete");
  await page.getByLabel("Pixel ID").fill(id);
  await page.getByRole("button", { name: "Save pixel" }).click();
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText("Delete pixel?")).toBeVisible();
  await page.getByRole("button", { name: "Delete pixel" }).click();
  // the deleted pixel is gone from the list
  await expect(page.getByText("To Delete")).toHaveCount(0);
});
