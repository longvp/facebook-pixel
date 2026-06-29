import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import { hashPII, buildEvent, sendEvents } from "./capi.server";

const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

describe("capi", () => {
  it("hashes lowercased, trimmed PII", () => {
    expect(hashPII("  Foo@Bar.com ")).toBe(sha("foo@bar.com"));
  });

  it("builds an event with hashed email and raw event_id", () => {
    const e = buildEvent({
      eventName: "Purchase",
      eventTime: 100,
      eventId: "evt-1",
      email: "a@b.com",
      currency: "USD",
      value: 9.5,
    });
    expect(e.event_name).toBe("Purchase");
    expect(e.event_id).toBe("evt-1");
    expect(e.user_data.em).toEqual([sha("a@b.com")]);
    expect(e.custom_data).toEqual({ currency: "USD", value: 9.5 });
  });

  it("POSTs to the graph endpoint with the pixel id", async () => {
    const fetchMock = vi.fn(
      async () =>
        new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendEvents(
      "PIX123",
      "tok",
      [buildEvent({ eventName: "PageView", eventTime: 1, eventId: "x" })],
      "TEST1",
    );
    expect(res.ok).toBe(true);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/PIX123/events");
    expect(url).toContain("access_token=tok");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.test_event_code).toBe("TEST1");
  });
});
