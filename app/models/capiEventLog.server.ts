import prisma from "../db.server";

export const EVENT_NAMES = [
  "PageView",
  "ViewContent",
  "AddToCart",
  "InitiateCheckout",
  "Purchase",
] as const;

export type CapiLogInput = {
  shop: string;
  pixelId: string;
  eventName: string;
  eventId: string;
  value?: number | null;
  currency?: string | null;
  status: "ok" | "failed";
  response?: string | null;
};

export async function logCapiEvent(input: CapiLogInput): Promise<void> {
  await prisma.capiEventLog.create({
    data: {
      shop: input.shop,
      pixelId: input.pixelId,
      eventName: input.eventName,
      eventId: input.eventId,
      value: input.value ?? null,
      currency: input.currency ?? null,
      status: input.status,
      response: input.response ?? null,
    },
  });
}

export type CountRow = { pixelId: string; eventName: string; count: number };

export async function countByPixelAndEvent(shop: string): Promise<CountRow[]> {
  const rows = await prisma.capiEventLog.groupBy({
    by: ["pixelId", "eventName"],
    where: { shop },
    _count: { _all: true },
  });
  return rows.map((r: any) => ({
    pixelId: r.pixelId,
    eventName: r.eventName,
    count: r._count._all,
  }));
}

export type PivotRow = {
  pixelId: string;
  name: string;
  capiEnabled: boolean;
  counts: Record<string, number>;
  total: number;
};

export function pivotCounts(
  rows: CountRow[],
  pixels: { pixelId: string; name: string; capiEnabled: boolean }[],
): PivotRow[] {
  return pixels.map((p) => {
    const counts: Record<string, number> = {};
    for (const name of EVENT_NAMES) counts[name] = 0;
    let total = 0;
    for (const r of rows) {
      if (r.pixelId === p.pixelId && counts[r.eventName] !== undefined) {
        counts[r.eventName] = r.count;
        total += r.count;
      }
    }
    return {
      pixelId: p.pixelId,
      name: p.name,
      capiEnabled: p.capiEnabled,
      counts,
      total,
    };
  });
}
