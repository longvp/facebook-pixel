import { test, expect } from "@playwright/test";

const uniqueId = (i: number) => `99${i}${Date.now().toString().slice(-7)}`;

test.beforeEach(async ({ page }) => {
  await page.goto("/app/pixels");
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

test("US-5: delete asks for confirmation", async ({ page }) => {
  const id = uniqueId(4);
  await page.getByRole("link", { name: "Add pixel" }).click();
  await page.getByLabel("Pixel name").fill("To Delete");
  await page.getByLabel("Pixel ID").fill(id);
  await page.getByRole("button", { name: "Save pixel" }).click();
  await page.getByRole("button", { name: "Delete" }).first().click();
  await expect(page.getByText("Do you want to delete")).toBeVisible();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "Delete" })
    .click();
  await expect(page.getByText("To Delete")).toHaveCount(0);
});

test("US-2: search filters the list", async ({ page }) => {
  for (const [i, name] of [
    [61, "Alpha Pixel"],
    [62, "Beta Pixel"],
  ] as const) {
    await page.getByRole("link", { name: "Add pixel" }).click();
    await page.getByLabel("Pixel name").fill(name);
    await page.getByLabel("Pixel ID").fill(uniqueId(i));
    await page.getByRole("button", { name: "Save pixel" }).click();
    await expect(page.getByText(name)).toBeVisible();
  }
  await page.getByPlaceholder("Search by pixel name, pixel ID").fill("Alpha");
  await expect(page.getByText("Alpha Pixel")).toBeVisible();
  await expect(page.getByText("Beta Pixel")).toHaveCount(0);
});

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
