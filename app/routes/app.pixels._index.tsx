import {
  json,
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
} from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page,
  Card,
  IndexTable,
  Button,
  Badge,
  TextField,
  Text,
  InlineStack,
  Modal,
  Frame,
  Toast,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { requireAdmin } from "../lib/auth.server";
import { listPixels, deletePixel, updatePixel } from "../models/pixel.server";
import { syncWebPixel } from "../lib/webPixel.server";
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await requireAdmin(request);
  return json({ pixels: await listPixels(session.shop) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session, admin } = await requireAdmin(request);
  const form = await request.formData();
  const id = String(form.get("id"));
  const op = String(form.get("_action"));
  try {
    if (op === "delete") {
      await deletePixel(session.shop, id);
      await syncWebPixel(admin, session.shop).catch((e) =>
        console.error("syncWebPixel", e),
      );
    } else if (op === "setTestCode") {
      await updatePixel(session.shop, id, {
        testEventCode: String(form.get("testEventCode") ?? "") || null,
      });
    }
    return json({ ok: true, op });
  } catch (e: any) {
    return json({ ok: false, error: e.message }, { status: 400 });
  }
};

export default function Index() {
  const { pixels } = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const [query, setQuery] = useState("");
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [setupId, setSetupId] = useState<string | null>(null);
  const [setupCode, setSetupCode] = useState("");
  const [toast, setToast] = useState<string | null>(null);

  // Surface action results as Polaris Toasts.
  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.ok) {
      const map: Record<string, string> = {
        delete: "Pixel deleted",
        setTestCode: "Test code updated",
      };
      setToast(map[(fetcher.data as any).op] ?? "Saved");
    } else {
      setToast((fetcher.data as any).error);
    }
  }, [fetcher.data]);

  const filtered = pixels.filter(
    (p) =>
      p.name.toLowerCase().includes(query.toLowerCase()) ||
      p.pixelId.includes(query),
  );

  const submit = (fields: Record<string, string>) =>
    fetcher.submit(fields, { method: "post" });

  return (
    <Frame>
      <Page
        title="Facebook Pixel & CAPI"
        primaryAction={{ content: "Add pixel", url: "/app/pixels/new" }}
      >
        <Card padding="0">
          <div style={{ padding: "12px 16px" }}>
            <TextField
              label="Search"
              labelHidden
              value={query}
              onChange={setQuery}
              placeholder="Search by pixel name, pixel ID"
              autoComplete="off"
            />
          </div>
          <IndexTable
            itemCount={filtered.length}
            selectable={false}
            headings={[
              { title: "Pixel ID" },
              { title: "Pixel name" },
              { title: "Is CAPI" },
              { title: "Test code event" },
              { title: "Actions" },
            ]}
            emptyState={
              <div style={{ padding: 32, textAlign: "center" }}>
                No pixels found
              </div>
            }
          >
            {filtered.map((p, i) => (
              <IndexTable.Row id={p.id} key={p.id} position={i}>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="bold">
                    <code>{p.pixelId}</code>
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" fontWeight="bold">
                    {p.name}
                  </Text>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  {p.capiEnabled ? (
                    <Badge tone="success">true</Badge>
                  ) : (
                    <Badge>false</Badge>
                  )}
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Button
                    disabled={!p.capiEnabled}
                    onClick={() => {
                      setSetupId(p.id);
                      setSetupCode(p.testEventCode ?? "");
                    }}
                  >
                    Setup
                  </Button>
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <InlineStack gap="200">
                    <Button url={`/app/pixels/${p.id}`}>Edit</Button>
                    <Button variant="primary" onClick={() => setDeleteId(p.id)}>
                      Delete
                    </Button>
                  </InlineStack>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>

        <Modal
          open={deleteId !== null}
          onClose={() => setDeleteId(null)}
          title="Do you want to delete"
          primaryAction={{
            content: "Delete",
            destructive: true,
            onAction: () => {
              if (deleteId) submit({ _action: "delete", id: deleteId });
              setDeleteId(null);
            },
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setDeleteId(null) },
          ]}
        >
          <Modal.Section>
            <Text as="p">
              This pixel will be permanently removed. This action cannot be
              undone.
            </Text>
          </Modal.Section>
        </Modal>

        <Modal
          open={setupId !== null}
          onClose={() => setSetupId(null)}
          title="Set up test code"
          primaryAction={{
            content: "Save",
            onAction: () => {
              if (setupId)
                submit({
                  _action: "setTestCode",
                  id: setupId,
                  testEventCode: setupCode,
                });
              setSetupId(null);
            },
          }}
          secondaryActions={[
            { content: "Cancel", onAction: () => setSetupId(null) },
          ]}
        >
          <Modal.Section>
            <TextField
              label="Test event code"
              value={setupCode}
              onChange={setSetupCode}
              maxLength={20}
              autoComplete="off"
              placeholder="e.g. TEST12345"
            />
          </Modal.Section>
        </Modal>

        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}
