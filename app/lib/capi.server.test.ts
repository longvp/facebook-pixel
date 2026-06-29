import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "node:crypto";
import {
  hashPII,
  buildEvent,
  sendEvents,
  validateCapiToken,
} from "./capi.server";

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
      async (..._args: any[]) =>
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

  it("includes fbp/fbc un-hashed in user_data", () => {
    const e = buildEvent({
      eventName: "Purchase",
      eventTime: 1,
      eventId: "x",
      fbp: "fb.1.123.456",
      fbc: "fb.1.123.abc",
    });
    expect(e.user_data.fbp).toBe("fb.1.123.456");
    expect(e.user_data.fbc).toBe("fb.1.123.abc");
  });
});

describe("validateCapiToken", () => {
  beforeEach(() => {
    delete process.env.E2E;
  });

  it("returns ok when the test event is accepted", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(JSON.stringify({ events_received: 1 }), { status: 200 }),
      ),
    );
    expect(await validateCapiToken("PIX", "tok")).toEqual({ ok: true });
  });

  it("returns the Meta error message when rejected", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () =>
          new Response(
            JSON.stringify({
              error: { message: "Invalid OAuth access token." },
            }),
            {
              status: 400,
            },
          ),
      ),
    );
    const r = await validateCapiToken("PIX", "tok");
    expect(r.ok).toBe(false);
    expect(r.error).toContain("Invalid OAuth access token");
  });

  it("skips the network and returns ok under E2E", async () => {
    process.env.E2E = "1";
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await validateCapiToken("PIX", "tok")).toEqual({ ok: true });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
