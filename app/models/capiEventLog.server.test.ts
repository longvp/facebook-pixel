import { describe, it, expect, vi } from "vitest";

vi.mock("../db.server", () => ({
  default: {
    capiEventLog: {
      create: vi.fn(async () => ({})),
      groupBy: vi.fn(async () => [
        { pixelId: "111", eventName: "PageView", _count: { _all: 3 } },
        { pixelId: "111", eventName: "Purchase", _count: { _all: 1 } },
      ]),
    },
  },
}));

import prisma from "../db.server";
import {
  logCapiEvent,
  countByPixelAndEvent,
  pivotCounts,
} from "./capiEventLog.server";

describe("capiEventLog", () => {
  it("logCapiEvent inserts a row", async () => {
    await logCapiEvent({
      shop: "s",
      pixelId: "111",
      eventName: "Purchase",
      eventId: "e1",
      value: 9.5,
      currency: "USD",
      status: "ok",
      response: "{}",
    });
    expect((prisma as any).capiEventLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        shop: "s",
        pixelId: "111",
        status: "ok",
      }),
    });
  });

  it("countByPixelAndEvent maps groupBy counts", async () => {
    const rows = await countByPixelAndEvent("s");
    expect(rows).toEqual([
      { pixelId: "111", eventName: "PageView", count: 3 },
      { pixelId: "111", eventName: "Purchase", count: 1 },
    ]);
  });

  it("pivotCounts builds per-pixel rows with totals", () => {
    const pivot = pivotCounts(
      [
        { pixelId: "111", eventName: "PageView", count: 3 },
        { pixelId: "111", eventName: "Purchase", count: 1 },
      ],
      [{ pixelId: "111", name: "My Pixel", capiEnabled: true }],
    );
    expect(pivot).toEqual([
      {
        pixelId: "111",
        name: "My Pixel",
        capiEnabled: true,
        counts: {
          PageView: 3,
          ViewContent: 0,
          AddToCart: 0,
          InitiateCheckout: 0,
          Purchase: 1,
        },
        total: 4,
      },
    ]);
  });
});
