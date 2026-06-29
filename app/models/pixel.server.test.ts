import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.server", () => {
  const rows: any[] = [];
  let seq = 0;
  return {
    default: {
      pixel: {
        create: vi.fn(async ({ data }: any) => {
          const r = { id: `p${++seq}`, ...data };
          rows.push(r);
          return r;
        }),
        findMany: vi.fn(async () => rows),
        findFirst: vi.fn(
          async ({ where }: any) => rows.find((r) => r.id === where.id) ?? null,
        ),
        update: vi.fn(async ({ where, data }: any) => {
          const r = rows.find((x) => x.id === where.id);
          Object.assign(r, data);
          return r;
        }),
        delete: vi.fn(async () => {}),
      },
    },
  };
});

import { createPixel, setCapiEnabled } from "./pixel.server";

beforeEach(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("pixel model", () => {
  it("redacts the access token in the returned view", async () => {
    const view: any = await createPixel("s.myshopify.com", {
      name: "P",
      pixelId: "123",
      capiEnabled: true,
      accessToken: "tok",
    });
    expect(view.accessToken).toBeUndefined();
    expect(view.hasAccessToken).toBe(true);
  });

  it("refuses to enable CAPI without a stored token", async () => {
    const p: any = await createPixel("s.myshopify.com", {
      name: "Q",
      pixelId: "999",
      capiEnabled: false,
    });
    await expect(setCapiEnabled("s.myshopify.com", p.id, true)).rejects.toThrow(
      /access token/i,
    );
  });
});
