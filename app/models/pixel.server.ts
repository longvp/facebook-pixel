import prisma from "../db.server";
import { encrypt, decrypt } from "../lib/crypto.server";

export type PixelInput = {
  name: string;
  pixelId: string;
  capiEnabled: boolean;
  accessToken?: string;
  testEventCode?: string | null;
};

export type PixelView = {
  id: string;
  shop: string;
  name: string;
  pixelId: string;
  capiEnabled: boolean;
  hasAccessToken: boolean;
  testEventCode: string | null;
  active: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function toView(p: any): PixelView {
  const { accessToken, ...rest } = p;
  return {
    ...rest,
    hasAccessToken: Boolean(accessToken),
  };
}

export async function listPixels(shop: string): Promise<PixelView[]> {
  const rows = await prisma.pixel.findMany({
    where: { shop },
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toView);
}

export async function getPixel(
  shop: string,
  id: string,
): Promise<PixelView | null> {
  const p = await prisma.pixel.findFirst({ where: { id, shop } });
  return p ? toView(p) : null;
}

export async function createPixel(
  shop: string,
  input: PixelInput,
): Promise<PixelView> {
  if (!input.name?.trim()) throw new Error("Pixel name is required");
  if (!input.pixelId?.trim()) throw new Error("Pixel ID is required");
  if (input.capiEnabled && !input.accessToken)
    throw new Error("An access token is required to enable CAPI");
  const p = await prisma.pixel.create({
    data: {
      shop,
      name: input.name.trim(),
      pixelId: input.pixelId.trim(),
      capiEnabled: input.capiEnabled,
      testEventCode: input.testEventCode ?? null,
      accessToken: input.accessToken ? encrypt(input.accessToken) : null,
    },
  });
  return toView(p);
}

export async function updatePixel(
  shop: string,
  id: string,
  input: Partial<PixelInput>,
): Promise<PixelView> {
  const existing = await prisma.pixel.findFirst({ where: { id, shop } });
  if (!existing) throw new Error("Pixel not found");
  const data: any = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.testEventCode !== undefined)
    data.testEventCode = input.testEventCode;
  if (input.accessToken) data.accessToken = encrypt(input.accessToken);
  if (input.capiEnabled !== undefined) {
    const hasToken = input.accessToken || existing.accessToken;
    if (input.capiEnabled && !hasToken)
      throw new Error("An access token is required to enable CAPI");
    data.capiEnabled = input.capiEnabled;
  }
  // pixelId is immutable — intentionally never written here.
  const p = await prisma.pixel.update({ where: { id }, data });
  return toView(p);
}

export async function deletePixel(shop: string, id: string): Promise<void> {
  const existing = await prisma.pixel.findFirst({ where: { id, shop } });
  if (!existing) throw new Error("Pixel not found");
  await prisma.pixel.delete({ where: { id } });
}

export async function setActive(
  shop: string,
  id: string,
  active: boolean,
): Promise<PixelView> {
  const existing = await prisma.pixel.findFirst({ where: { id, shop } });
  if (!existing) throw new Error("Pixel not found");
  return toView(await prisma.pixel.update({ where: { id }, data: { active } }));
}

export async function setCapiEnabled(
  shop: string,
  id: string,
  enabled: boolean,
): Promise<PixelView> {
  const existing = await prisma.pixel.findFirst({ where: { id, shop } });
  if (!existing) throw new Error("Pixel not found");
  if (enabled && !existing.accessToken)
    throw new Error("An access token is required to enable CAPI");
  return toView(
    await prisma.pixel.update({
      where: { id },
      data: { capiEnabled: enabled },
    }),
  );
}

export async function getDecryptedToken(
  shop: string,
  id: string,
): Promise<string | null> {
  const p = await prisma.pixel.findFirst({ where: { id, shop } });
  return p?.accessToken ? decrypt(p.accessToken) : null;
}
