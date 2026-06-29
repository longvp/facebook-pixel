import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../models/pixel.server", () => ({
  listPixels: vi.fn(async () => [
    {
      id: "p1",
      pixelId: "111",
      active: true,
      capiEnabled: true,
      testEventCode: null,
    },
    {
      id: "p2",
      pixelId: "222",
      active: true,
      capiEnabled: false,
      testEventCode: null,
    },
  ]),
  getDecryptedToken: vi.fn(async () => "tok"),
}));
const sendEvents = vi.fn(async () => ({ ok: true, status: 200, body: {} }));
vi.mock("./capi.server", async (orig) => ({
  ...(await orig<any>()),
  sendEvents: (...a: any[]) => sendEvents(...a),
}));
const logCapiEvent = vi.fn(async () => {});
vi.mock("../models/capiEventLog.server", () => ({
  logCapiEvent: (...a: any[]) => logCapiEvent(...a),
}));

import { handleCapiEvent } from "./capiHandler.server";

beforeEach(() => {
  sendEvents.mockClear();
  logCapiEvent.mockClear();
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("handleCapiEvent", () => {
  it("sends + logs only for active capi-enabled pixels", async () => {
    await handleCapiEvent("s.myshopify.com", {
      eventName: "Purchase",
      eventId: "order-9",
      currency: "USD",
      value: 10,
      fbp: "fb.1",
    });
    expect(sendEvents).toHaveBeenCalledTimes(1);
    expect(sendEvents.mock.calls[0][0]).toBe("111");
    expect(logCapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({
        pixelId: "111",
        eventName: "Purchase",
        status: "ok",
      }),
    );
  });

  it("logs status=failed when the send fails", async () => {
    sendEvents.mockResolvedValueOnce({
      ok: false,
      status: 400,
      body: { error: "bad" },
    });
    await handleCapiEvent("s.myshopify.com", {
      eventName: "PageView",
      eventId: "x",
    });
    expect(logCapiEvent).toHaveBeenCalledWith(
      expect.objectContaining({ status: "failed" }),
    );
  });
});
