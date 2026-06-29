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
  fbp?: string;
  fbc?: string;
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
  if (input.fbp) user_data.fbp = input.fbp;
  if (input.fbc) user_data.fbc = input.fbc;

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
  const url = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${accessToken}`;
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

export async function validateCapiToken(
  pixelId: string,
  token: string,
  testEventCode?: string | null,
): Promise<{ ok: boolean; error?: string }> {
  // No network in E2E — the requireAdmin shim pattern.
  if (process.env.E2E === "1") return { ok: true };

  const event = buildEvent({
    eventName: "PageView",
    eventTime: Math.floor(Date.now() / 1000),
    eventId: `validate-${Date.now()}`,
    // Meta rejects events with no customer-information parameters (code 100 /
    // subcode 2804050 "insufficient customer information"). A client_user_agent
    // + client_ip_address pair satisfies the check, so the result reflects the
    // TOKEN's validity (190 = bad token) rather than a missing-params error.
    userAgent: "Mozilla/5.0",
    clientIp: "1.2.3.4",
  });
  // Route the validation ping to Test Events so it isn't counted as a real event.
  const res = await sendEvents(
    pixelId,
    token,
    [event],
    testEventCode || "TOKEN_VALIDATION",
  );
  if (res.ok) return { ok: true };
  const message =
    res.body?.error?.message ||
    `Token validation failed (status ${res.status})`;
  return { ok: false, error: message };
}
