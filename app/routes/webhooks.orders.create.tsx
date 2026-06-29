import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { listPixels, getDecryptedToken } from "../models/pixel.server";
import { buildEvent, sendEvents } from "../lib/capi.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, topic, payload } = await authenticate.webhook(request);
  console.log(`Received ${topic} webhook for ${shop}`);

  const order: any = payload;

  // Fire a server-side Purchase event for every active, CAPI-enabled pixel.
  const pixels = (await listPixels(shop)).filter(
    (p) => p.active && p.capiEnabled,
  );
  const eventTime =
    Math.floor(Date.parse(order.created_at ?? "") / 1000) ||
    Math.floor(Date.now() / 1000);

  await Promise.all(
    pixels.map(async (p) => {
      const token = await getDecryptedToken(shop, p.id);
      if (!token) return;
      const event = buildEvent({
        eventName: "Purchase",
        eventTime,
        eventId: `order-${order.id}`, // shared with the browser pixel for dedup
        email: order.email ?? undefined,
        phone: order.phone ?? undefined,
        currency: order.currency,
        value: Number(order.total_price),
      });
      const res = await sendEvents(p.pixelId, token, [event], p.testEventCode);
      if (!res.ok) {
        console.error("CAPI send failed", p.pixelId, res.status, res.body);
      }
    }),
  );

  return new Response();
};
