import {
  Form,
  useSubmit,
  useRouteLoaderData,
  useNavigation,
} from "@remix-run/react";
import {
  Card,
  BlockStack,
  FormLayout,
  TextField,
  Checkbox,
  Banner,
  Text,
  InlineStack,
  Button,
  Box,
} from "@shopify/polaris";
import { SaveBar, useAppBridge } from "@shopify/app-bridge-react";
import { useEffect, useRef, useState } from "react";
import type { PixelView } from "../models/pixel.server";

// Shopify contextual SaveBar (App Bridge) — only mounted in the embedded app.
function PixelSaveBar({
  dirty,
  submitting,
  onSave,
  onDiscard,
}: {
  dirty: boolean;
  submitting: boolean;
  onSave: () => void;
  onDiscard: () => void;
}) {
  const shopify = useAppBridge();
  // Hide while submitting so the post-save redirect isn't blocked by App
  // Bridge's "unsaved changes" guard (a visible SaveBar intercepts navigation).
  // On a failed save the form stays dirty and submitting returns to idle, so
  // the bar reappears.
  useEffect(() => {
    if (dirty && !submitting) shopify.saveBar.show("pixel-save-bar");
    else shopify.saveBar.hide("pixel-save-bar");
  }, [dirty, submitting, shopify]);
  // The SaveBar is a global App Bridge surface; without this, leaving the form
  // while still dirty (e.g. Save → redirect to the list) leaves it showing.
  useEffect(() => {
    return () => {
      shopify.saveBar.hide("pixel-save-bar");
    };
  }, [shopify]);
  return (
    <SaveBar id="pixel-save-bar">
      <button variant="primary" onClick={onSave}>
        Save
      </button>
      <button onClick={onDiscard}>Discard</button>
    </SaveBar>
  );
}

export function PixelForm({
  mode,
  initial,
  error,
}: {
  mode: "new" | "edit";
  // Only the fields the form reads — JSON-safe, so a serialized loader value
  // (JsonifyObject<PixelView>) assigns cleanly.
  initial?: Pick<
    PixelView,
    | "name"
    | "pixelId"
    | "capiEnabled"
    | "testEventCode"
    | "hasAccessToken"
    | "accessToken"
  >;
  error?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [pixelId, setPixelId] = useState(initial?.pixelId ?? "");
  const [capiEnabled, setCapiEnabled] = useState(initial?.capiEnabled ?? false);
  // Pre-fill the real token on edit so the origin token is shown.
  const [accessToken, setAccessToken] = useState(initial?.accessToken ?? "");
  const [testEventCode, setTestEventCode] = useState(
    initial?.testEventCode ?? "",
  );

  const formRef = useRef<HTMLFormElement>(null);
  const submit = useSubmit();
  const navigation = useNavigation();
  const submitting = navigation.state !== "idle";

  // App Bridge isn't loaded in E2E (Polaris-only app.tsx branch) — fall back to
  // inline buttons there so the SaveBar (App Bridge) is never required.
  const appData = useRouteLoaderData("routes/app") as
    { e2e?: boolean } | undefined;
  const e2e = appData?.e2e ?? false;

  const dirty =
    name !== (initial?.name ?? "") ||
    pixelId !== (initial?.pixelId ?? "") ||
    capiEnabled !== (initial?.capiEnabled ?? false) ||
    accessToken !== (initial?.accessToken ?? "") ||
    testEventCode !== (initial?.testEventCode ?? "");

  const handleSave = () => submit(formRef.current, { method: "post" });
  const handleDiscard = () => {
    setName(initial?.name ?? "");
    setPixelId(initial?.pixelId ?? "");
    setCapiEnabled(initial?.capiEnabled ?? false);
    setAccessToken(initial?.accessToken ?? "");
    setTestEventCode(initial?.testEventCode ?? "");
  };

  return (
    <Form method="post" ref={formRef}>
      <BlockStack gap="400">
        {error && <Banner tone="critical">{error}</Banner>}
        <Card>
          <FormLayout>
            <TextField
              label="Pixel name"
              name="name"
              value={name}
              onChange={setName}
              maxLength={255}
              showCharacterCount
              autoComplete="off"
              requiredIndicator
            />
            <TextField
              label="Pixel ID"
              name="pixelId"
              value={pixelId}
              onChange={setPixelId}
              maxLength={20}
              showCharacterCount
              autoComplete="off"
              requiredIndicator
              disabled={mode === "edit"}
              helpText={
                mode === "edit" ? "Pixel ID cannot be changed." : undefined
              }
            />
          </FormLayout>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h3" variant="headingSm">
                  Conversions API (solution for iOS 14.5)
                </Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Enable server-side API to track customer events bypassing
                  browser limitations and ad-blockers.
                </Text>
              </BlockStack>
              <Checkbox
                label="Enable CAPI"
                labelHidden
                checked={capiEnabled}
                onChange={setCapiEnabled}
              />
            </InlineStack>
            {capiEnabled && (
              <FormLayout>
                <TextField
                  label="Facebook access token"
                  name="accessToken"
                  type="text"
                  value={accessToken}
                  onChange={setAccessToken}
                  autoComplete="off"
                  placeholder="Enter your access token"
                  helpText="Requires a System User Token with ads_management and ads_read."
                />
                <TextField
                  label="Test event code"
                  name="testEventCode"
                  value={testEventCode}
                  onChange={setTestEventCode}
                  maxLength={20}
                  showCharacterCount
                  autoComplete="off"
                />
                <Banner tone="warning">
                  Use the test event code only while testing. Remove it
                  afterward.
                </Banner>
              </FormLayout>
            )}
            <input
              type="hidden"
              name="capiEnabled"
              value={String(capiEnabled)}
            />
          </BlockStack>
        </Card>

        {e2e ? (
          <Box>
            <InlineStack align="end" gap="200">
              <Button url="/app/pixels">Discard</Button>
              <Button submit variant="primary">
                Save pixel
              </Button>
            </InlineStack>
          </Box>
        ) : (
          <PixelSaveBar
            dirty={dirty}
            submitting={submitting}
            onSave={handleSave}
            onDiscard={handleDiscard}
          />
        )}
      </BlockStack>
    </Form>
  );
}
