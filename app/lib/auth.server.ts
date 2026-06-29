import { authenticate } from "../shopify.server";

export const E2E_SHOP = "e2e-test.myshopify.com";

// In E2E mode, bypass Shopify OAuth/iframe with a stub session so Playwright can
// drive the admin UI headlessly. In every other mode, authenticate normally.
export async function requireAdmin(request: Request) {
  if (process.env.E2E === "1") {
    return { session: { shop: E2E_SHOP }, admin: null as any };
  }
  return authenticate.admin(request);
}

export function isE2E(): boolean {
  return process.env.E2E === "1";
}
