import prisma from "../db.server";
import { listPixels } from "../models/pixel.server";

// Activation for the Web Pixel Extension. The sandboxed storefront pixel only
// runs once the app creates a web pixel for the shop (webPixelCreate) and passes
// the active Facebook Pixel IDs through its `settings`. Call syncWebPixel after
// any change to pixels so the storefront tracks the current active set.
//
// `admin` is the authenticated admin GraphQL client from authenticate.admin().
// In E2E / unauthenticated contexts admin is null and this is a no-op.
// We persist the created web pixel's id (one per shop) in WebPixelConfig so we
// can update it on subsequent changes (resolves open item Q-2, option A).

type AdminGraphql = {
  graphql: (query: string, options?: any) => Promise<Response>;
};

const CREATE = `#graphql
  mutation Create($settings: JSON!) {
    webPixelCreate(webPixel: { settings: $settings }) {
      webPixel { id }
      userErrors { field message }
    }
  }`;

const UPDATE = `#graphql
  mutation Update($id: ID!, $settings: JSON!) {
    webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
      webPixel { id }
      userErrors { field message }
    }
  }`;

async function buildSettings(shop: string): Promise<string> {
  const pixels = await listPixels(shop);
  // Browser (client) beacon fires for every ACTIVE pixel — independent of CAPI.
  const listPixelClient = pixels.filter((p) => p.active).map((p) => p.pixelId);
  // Server CAPI fires only for ACTIVE + CAPI-enabled pixels.
  const listPixelCapi = pixels
    .filter((p) => p.active && p.capiEnabled)
    .map((p) => p.pixelId);
  // Shopify web pixel settings fields must be strings (single_line_text_field),
  // so encode each string[] as a JSON string; the extension parses it back.
  return JSON.stringify({
    listPixelClient: JSON.stringify(listPixelClient),
    listPixelCapi: JSON.stringify(listPixelCapi),
  });
}

export async function syncWebPixel(
  admin: AdminGraphql | null,
  shop: string,
): Promise<void> {
  if (!admin) return;
  if (!(prisma as any).webPixelConfig) {
    console.error(
      "[syncWebPixel] Prisma client is missing WebPixelConfig — run `npx prisma generate` and RESTART the dev server.",
    );
    return;
  }
  const settings = await buildSettings(shop);
  console.log("[syncWebPixel] shop=%s settings=%s", shop, settings);

  const config = await prisma.webPixelConfig.findUnique({ where: { shop } });

  if (config?.webPixelId) {
    const res = await admin.graphql(UPDATE, {
      variables: { id: config.webPixelId, settings },
    });
    const json: any = await res.json();
    const errs = json?.data?.webPixelUpdate?.userErrors ?? [];
    if (errs.length)
      console.warn("[syncWebPixel] webPixelUpdate userErrors:", errs);
    return;
  }

  const res = await admin.graphql(CREATE, { variables: { settings } });
  const json: any = await res.json();
  const id = json?.data?.webPixelCreate?.webPixel?.id;
  if (id) {
    await prisma.webPixelConfig.upsert({
      where: { shop },
      create: { shop, webPixelId: id },
      update: { webPixelId: id },
    });
    console.log("[syncWebPixel] stored webPixelId=%s", id);
  } else {
    console.warn(
      "[syncWebPixel] webPixelCreate failed:",
      JSON.stringify(
        json?.data?.webPixelCreate?.userErrors ?? json?.errors ?? json,
      ),
    );
  }
}
