import { listPixels } from "../models/pixel.server";

// Activation for the Web Pixel Extension. The sandboxed storefront pixel only
// runs once the app creates a web pixel for the shop (webPixelCreate) and passes
// the active Facebook Pixel IDs through its `settings`. Call syncWebPixel after
// any change to pixels so the storefront tracks the current active set.
//
// `admin` is the authenticated admin GraphQL client from authenticate.admin().
// In E2E / unauthenticated contexts admin is null and this is a no-op.
//
// NOTE (open item Q-2): one web pixel exists per app+shop. To update it we need
// its id; we persist that id in the Session-less way by re-creating on demand —
// if create reports it already exists, the caller should pass the stored id to
// update. For now we create once and update by id when known.

type AdminGraphql = { graphql: (q: string, opts?: any) => Promise<Response> };

async function activePixelIdsCsv(shop: string): Promise<string> {
  const pixels = await listPixels(shop);
  return pixels
    .filter((p) => p.active)
    .map((p) => p.pixelId)
    .join(",");
}

export async function syncWebPixel(
  admin: AdminGraphql | null,
  shop: string,
  webPixelId?: string,
): Promise<{ id: string } | null> {
  if (!admin) return null;
  const settings = JSON.stringify({ pixelIds: await activePixelIdsCsv(shop) });

  if (webPixelId) {
    const res = await admin.graphql(
      `#graphql
      mutation Update($id: ID!, $settings: JSON!) {
        webPixelUpdate(id: $id, webPixel: { settings: $settings }) {
          webPixel { id }
          userErrors { field message }
        }
      }`,
      { variables: { id: webPixelId, settings } },
    );
    const json: any = await res.json();
    const id = json?.data?.webPixelUpdate?.webPixel?.id;
    return id ? { id } : null;
  }

  const res = await admin.graphql(
    `#graphql
    mutation Create($settings: JSON!) {
      webPixelCreate(webPixel: { settings: $settings }) {
        webPixel { id }
        userErrors { field message }
      }
    }`,
    { variables: { settings } },
  );
  const json: any = await res.json();
  const id = json?.data?.webPixelCreate?.webPixel?.id;
  if (id) return { id };
  // Already exists or failed — log for the caller to handle (e.g. store + update).
  console.warn(
    "webPixelCreate:",
    json?.data?.webPixelCreate?.userErrors ?? json,
  );
  return null;
}
