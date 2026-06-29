import { listPixels, getDecryptedToken } from "../models/pixel.server";
import { buildEvent, sendEvents } from "./capi.server";
import { logCapiEvent } from "../models/capiEventLog.server";

export type CapiPayload = {
  eventName: string;
  eventId: string;
  url?: string;
  currency?: string;
  value?: number;
  fbp?: string;
  fbc?: string;
  userAgent?: string;
  email?: string;
  phone?: string;
};

export async function handleCapiEvent(
  shop: string,
  payload: CapiPayload,
): Promise<void> {
  const pixels = (await listPixels(shop)).filter(
    (p) => p.active && p.capiEnabled,
  );
  const eventTime = Math.floor(Date.now() / 1000);

  await Promise.all(
    pixels.map(async (p) => {
      const token = await getDecryptedToken(shop, p.id);
      if (!token) return;
      const event = buildEvent({
        eventName: payload.eventName,
        eventTime,
        eventId: payload.eventId,
        sourceUrl: payload.url,
        email: payload.email,
        phone: payload.phone,
        userAgent: payload.userAgent,
        fbp: payload.fbp,
        fbc: payload.fbc,
        currency: payload.currency,
        value: payload.value,
      });
      let status: "ok" | "failed" = "ok";
      let response = "";
      try {
        const res = await sendEvents(
          p.pixelId,
          token,
          [event],
          p.testEventCode,
        );
        status = res.ok ? "ok" : "failed";
        response = JSON.stringify(res.body);
      } catch (e: any) {
        status = "failed";
        response = String(e?.message ?? e);
      }
      await logCapiEvent({
        shop,
        pixelId: p.pixelId,
        eventName: payload.eventName,
        eventId: payload.eventId,
        value: payload.value ?? null,
        currency: payload.currency ?? null,
        status,
        response,
      });
    }),
  );
}
