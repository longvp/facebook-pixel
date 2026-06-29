import crypto from "node:crypto";

const API_VERSION = "v19.0";

export type CapiEventInput = {
  eventName: string;
  eventTime: number;
  eventId: string;
  sourceUrl?: string;
  email?: string;
  phone?: string;
  clientIp?: string;
  userAgent?: string;
  currency?: string;
  value?: number;
};

export type CapiEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url?: string;
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
};

export function hashPII(value: string): string {
  return crypto
    .createHash("sha256")
    .update(value.trim().toLowerCase())
    .digest("hex");
}

export function buildEvent(input: CapiEventInput): CapiEvent {
  const user_data: Record<string, unknown> = {};
  if (input.email) user_data.em = [hashPII(input.email)];
  if (input.phone) user_data.ph = [hashPII(input.phone)];
  if (input.clientIp) user_data.client_ip_address = input.clientIp;
  if (input.userAgent) user_data.client_user_agent = input.userAgent;

  const custom_data: Record<string, unknown> = {};
  if (input.currency) custom_data.currency = input.currency;
  if (input.value !== undefined) custom_data.value = input.value;

  const event: CapiEvent = {
    event_name: input.eventName,
    event_time: input.eventTime,
    event_id: input.eventId,
    action_source: "website",
    user_data,
  };
  if (input.sourceUrl) event.event_source_url = input.sourceUrl;
  if (Object.keys(custom_data).length) event.custom_data = custom_data;
  return event;
}

export async function sendEvents(
  pixelId: string,
  accessToken: string,
  events: CapiEvent[],
  testEventCode?: string | null,
): Promise<{ ok: boolean; status: number; body: any }> {
  const url = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
  const payload: Record<string, unknown> = { data: events };
  if (testEventCode) payload.test_event_code = testEventCode;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
