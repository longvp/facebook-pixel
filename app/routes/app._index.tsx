import { json, type LoaderFunctionArgs } from "@remix-run/node";
import { useLoaderData } from "@remix-run/react";
import { Page, Card, IndexTable, Text } from "@shopify/polaris";
import { requireAdmin } from "../lib/auth.server";
import { listPixels } from "../models/pixel.server";
import {
  countByPixelAndEvent,
  pivotCounts,
  EVENT_NAMES,
} from "../models/capiEventLog.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await requireAdmin(request);
  const [counts, pixels] = await Promise.all([
    countByPixelAndEvent(session.shop),
    listPixels(session.shop),
  ]);
  const rows = pivotCounts(
    counts,
    pixels.map((p) => ({ pixelId: p.pixelId, name: p.name })),
  );
  return json({ rows, eventNames: EVENT_NAMES });
};

export default function Home() {
  const { rows, eventNames } = useLoaderData<typeof loader>();
  return (
    <Page title="Home — CAPI events">
      <Card padding="0">
        <IndexTable
          itemCount={rows.length}
          selectable={false}
          headings={[
            { title: "Pixel" },
            ...eventNames.map((n) => ({ title: n })),
            { title: "Total" },
          ]}
          emptyState={
            <div style={{ padding: 32, textAlign: "center" }}>
              No CAPI events yet
            </div>
          }
        >
          {rows.map((r, i) => (
            <IndexTable.Row id={r.pixelId} key={r.pixelId} position={i}>
              <IndexTable.Cell>
                <Text as="span" fontWeight="medium">
                  {r.name}
                </Text>
              </IndexTable.Cell>
              {eventNames.map((n) => (
                <IndexTable.Cell key={n}>{r.counts[n]}</IndexTable.Cell>
              ))}
              <IndexTable.Cell>
                <Text as="span" fontWeight="medium">
                  {r.total}
                </Text>
              </IndexTable.Cell>
            </IndexTable.Row>
          ))}
        </IndexTable>
      </Card>
    </Page>
  );
}
