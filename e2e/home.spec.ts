import { test, expect } from "@playwright/test";

test("Home renders the CAPI events dashboard", async ({ page }) => {
  await page.goto("/app");
  await expect(
    page.getByRole("heading", { name: "Home — CAPI events" }),
  ).toBeVisible();
});
