import { describe, it, expect, vi, beforeEach } from "vitest";

const state: { config: any; upserts: any[] } = { config: null, upserts: [] };

vi.mock("../db.server", () => ({
  default: {
    pixel: {
      findMany: vi.fn(async () => [
        { active: true, pixelId: "111" },
        { active: false, pixelId: "222" },
        { active: true, pixelId: "333" },
      ]),
    },
    webPixelConfig: {
      findUnique: vi.fn(async () => state.config),
      upsert: vi.fn(async ({ create }: any) => {
        state.upserts.push(create);
        return create;
      }),
    },
  },
}));

import { syncWebPixel } from "./webPixel.server";

function admin(json: any) {
  const graphql = vi.fn(async () => ({ json: async () => json }) as any);
  return { graphql };
}

beforeEach(() => {
  state.config = null;
  state.upserts = [];
});

describe("syncWebPixel", () => {
  it("is a no-op without an admin client", async () => {
    await expect(
      syncWebPixel(null, "s.myshopify.com"),
    ).resolves.toBeUndefined();
    expect(state.upserts).toHaveLength(0);
  });

  it("creates the web pixel with active pixel ids and stores its id", async () => {
    const a = admin({
      data: {
        webPixelCreate: { webPixel: { id: "gid://wp/1" }, userErrors: [] },
      },
    });
    await syncWebPixel(a, "s.myshopify.com");

    const [query, opts] = a.graphql.mock.calls[0];
    expect(query).toContain("webPixelCreate");
    // Shopify settings fields are strings; the array is encoded as a JSON string.
    const sent = JSON.parse(opts.variables.settings);
    expect(typeof sent.pixelIds).toBe("string");
    expect(JSON.parse(sent.pixelIds)).toEqual(["111", "333"]);
    expect(state.upserts[0]).toEqual({
      shop: "s.myshopify.com",
      webPixelId: "gid://wp/1",
    });
  });

  it("updates the existing web pixel when an id is already stored", async () => {
    state.config = { shop: "s.myshopify.com", webPixelId: "gid://wp/9" };
    const a = admin({
      data: {
        webPixelUpdate: { webPixel: { id: "gid://wp/9" }, userErrors: [] },
      },
    });
    await syncWebPixel(a, "s.myshopify.com");

    const [query, opts] = a.graphql.mock.calls[0];
    expect(query).toContain("webPixelUpdate");
    expect(opts.variables.id).toBe("gid://wp/9");
    expect(state.upserts).toHaveLength(0);
  });
});
