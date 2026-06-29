import { json, redirect, type ActionFunctionArgs } from "@remix-run/node";
import { useActionData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { requireAdmin } from "../lib/auth.server";
import { createPixel } from "../models/pixel.server";
import { syncWebPixel } from "../lib/webPixel.server";
import { validateCapiToken } from "../lib/capi.server";
import { PixelForm } from "../components/PixelForm";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await requireAdmin(request);
  const f = await request.formData();
  try {
    const capiEnabled = f.get("capiEnabled") === "true";
    const accessToken = (f.get("accessToken") as string) || undefined;
    const testEventCode = (f.get("testEventCode") as string) || null;
    const pixelId = String(f.get("pixelId") ?? "");

    if (capiEnabled && accessToken) {
      const v = await validateCapiToken(pixelId, accessToken, testEventCode);
      if (!v.ok) return json({ error: v.error }, { status: 400 });
    }

    await createPixel(session.shop, {
      name: String(f.get("name") ?? ""),
      pixelId,
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

export default function NewPixel() {
  const data = useActionData<typeof action>();
  return (
    <Page title="Add Facebook pixel" backAction={{ url: "/app/pixels" }}>
      <PixelForm mode="new" error={data?.error} />
    </Page>
  );
}
