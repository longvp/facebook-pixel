import { json, redirect, type ActionFunctionArgs } from "@remix-run/node";
import { useActionData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { requireAdmin } from "../lib/auth.server";
import { createPixel } from "../models/pixel.server";
import { PixelForm } from "../components/PixelForm";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await requireAdmin(request);
  const f = await request.formData();
  try {
    await createPixel(session.shop, {
      name: String(f.get("name") ?? ""),
      pixelId: String(f.get("pixelId") ?? ""),
      capiEnabled: f.get("capiEnabled") === "true",
      accessToken: (f.get("accessToken") as string) || undefined,
      testEventCode: (f.get("testEventCode") as string) || null,
    });
    return redirect("/app");
  } catch (e: any) {
    return json({ error: e.message }, { status: 400 });
  }
};

export default function NewPixel() {
  const data = useActionData<typeof action>();
  return (
    <Page title="Add Facebook pixel" backAction={{ url: "/app" }}>
      <PixelForm mode="new" error={data?.error} />
    </Page>
  );
}
