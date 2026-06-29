import { Form } from "@remix-run/react";
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
import { useState } from "react";
import type { PixelView } from "../models/pixel.server";

export function PixelForm({
  mode,
  initial,
  error,
}: {
  mode: "new" | "edit";
  initial?: PixelView;
  error?: string;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [pixelId, setPixelId] = useState(initial?.pixelId ?? "");
  const [capiEnabled, setCapiEnabled] = useState(initial?.capiEnabled ?? false);
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState(
    initial?.testEventCode ?? "",
  );

  return (
    <Form method="post">
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
                  type="password"
                  value={accessToken}
                  onChange={setAccessToken}
                  autoComplete="off"
                  placeholder={
                    initial?.hasAccessToken
                      ? "•••••••• (leave blank to keep)"
                      : "Enter your access token"
                  }
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

        <Box>
          <InlineStack align="end" gap="200">
            <Button url="/app">Discard</Button>
            <Button submit variant="primary">
              Save pixel
            </Button>
          </InlineStack>
        </Box>
      </BlockStack>
    </Form>
  );
}
