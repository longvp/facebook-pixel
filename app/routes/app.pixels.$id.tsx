import {
  json,
  redirect,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useActionData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { requireAdmin } from "../lib/auth.server";
import { getPixel, updatePixel } from "../models/pixel.server";
import { syncWebPixel } from "../lib/webPixel.server";
import { validateCapiToken } from "../lib/capi.server";
import { PixelForm } from "../components/PixelForm";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await requireAdmin(request);
  const pixel = await getPixel(session.shop, params.id!);
  if (!pixel) throw new Response("Not found", { status: 404 });
  return json({ pixel });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session, admin } = await requireAdmin(request);
  const f = await request.formData();
  try {
    const capiEnabled = f.get("capiEnabled") === "true";
    const accessToken = (f.get("accessToken") as string) || undefined;
    const testEventCode = (f.get("testEventCode") as string) || null;

    if (capiEnabled && accessToken) {
      const existing = await getPixel(session.shop, params.id!);
      if (!existing) throw new Error("Pixel not found");
      const v = await validateCapiToken(
        existing.pixelId,
        accessToken,
        testEventCode,
      );
      if (!v.ok) return json({ error: v.error }, { status: 400 });
    }

    await updatePixel(session.shop, params.id!, {
      name: String(f.get("name") ?? ""),
      capiEnabled,
      accessToken,
      testEventCode,
    });
    await syncWebPixel(admin, session.shop).catch((e) =>
      console.error("syncWebPixel", e),
    );
    return redirect("/app/pixels");
  } catch (e: any) {
    return json({ error: e.message }, { status: 400 });
  }
};

export default function EditPixel() {
  const { pixel } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  return (
    <Page title="Edit Facebook pixel" backAction={{ url: "/app/pixels" }}>
      <PixelForm mode="edit" initial={pixel} error={data?.error} />
    </Page>
  );
}
