---
name: shopify-remix-patterns
description: Use when writing Remix routes, loaders, actions, webhooks, or Polaris UI in a Shopify App Remix project — authentication, data flow, and component conventions.
---

# Shopify App Remix patterns

## Auth in routes
```ts
import { authenticate } from "../shopify.server";
export const loader = async ({ request }) => {
  const { admin, session } = await authenticate.admin(request);
  // session.shop is the current shop domain
};
```

## Loaders return data, actions mutate
- `loader` → read for GET. Return `json(...)`.
- `action` → handle POST/PUT/DELETE. Branch on `request.method` or a hidden
  `_action` field. Return `json(...)` or `redirect(...)`.

## Webhooks
```ts
export const action = async ({ request }) => {
  const { topic, shop, payload } = await authenticate.webhook(request);
  // handle, then return new Response();
};
```
Register topics in `shopify.app.toml` under `[webhooks]`.

## Polaris UI
- Wrap pages in `<Page>`; group content in `<Card>` / `<BlockStack>`.
- Tables: `<IndexTable>`. Forms: `<FormLayout>`, `<TextField>`, `<Select>`,
  `<RadioButton>`, `<Checkbox>`. Feedback: `<Banner>`, `Toast` (App Bridge / Frame).
- Submit via Remix `<Form method="post">` or `useSubmit()`.
