import { json, type ActionFunctionArgs } from "@remix-run/node";
import { handleCapiEvent } from "../lib/capiHandler.server";

// Public cross-origin endpoint the Web Pixel POSTs to (the sandbox blocks
// same-origin App-Proxy URLs). The web pixel sends a no-cors text/plain body, so
// there is no App-Proxy signature — the shop is taken from the body.
// SECURITY: unsigned; a per-shop signature should be added before production.
export const action = async ({ request }: ActionFunctionArgs) => {
  const payload = await request.json().catch(() => null);
  const shop = payload?.shop;
  if (!shop || !payload?.eventName || !payload?.eventId) {
    return json(
      { ok: false, error: "shop, eventName and eventId are required" },
      { status: 400 },
    );
  }

  // Never block the storefront: log failures inside handleCapiEvent, always 200.
  await handleCapiEvent(shop, payload).catch((e) => console.error("capi", e));
  return json({ ok: true });
};
