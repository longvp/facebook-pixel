import { json, type ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { handleCapiEvent } from "../lib/capiHandler.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  // Verifies the Shopify App Proxy signature and resolves the shop.
  const { session } = await authenticate.public.appProxy(request);
  if (!session?.shop) return json({ ok: false }, { status: 401 });

  const payload = await request.json().catch(() => null);
  if (!payload?.eventName || !payload?.eventId) {
    return json(
      { ok: false, error: "eventName and eventId are required" },
      { status: 400 },
    );
  }

  // Never block the storefront: log failures inside handleCapiEvent, always 200.
  await handleCapiEvent(session.shop, payload).catch((e) =>
    console.error("capi proxy", e),
  );
  return json({ ok: true });
};
