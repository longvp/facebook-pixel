import { defineConfig } from "@playwright/test";

// Dummy Shopify env lets the app boot outside `shopify app dev`; the requireAdmin
// shim + app.tsx E2E branch keep auth/App Bridge out of the way.
export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  timeout: 30_000,
  fullyParallel: false,
  workers: 1,
  use: { baseURL: "http://localhost:3000" },
  webServer: {
    command: "npm run dev:e2e",
    url: "http://localhost:3000/app",
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    env: {
      E2E: "1",
      SHOPIFY_API_KEY: "e2e",
      SHOPIFY_API_SECRET: "e2e",
      SHOPIFY_APP_URL: "http://localhost:3000",
      SCOPES: "write_products,read_orders",
      DATABASE_URL:
        process.env.E2E_DATABASE_URL ??
        "mysql://root:@127.0.0.1:3306/facebook_pixel_e2e",
    },
  },
});
