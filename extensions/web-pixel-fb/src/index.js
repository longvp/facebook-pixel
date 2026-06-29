import { register } from "@shopify/web-pixels-extension";

// Runs in Shopify's sandboxed (strict) web-pixel worker: no window/document, but
// fetch IS available. We therefore fire Facebook's image-beacon endpoint
// (facebook.com/tr) instead of the classic fbq snippet, attaching an `eid`
// (event id) that matches the server-side CAPI event for deduplication.
register(({ analytics, settings }) => {
  // settings.pixelIds is an array of strings; tolerate a CSV string too.
  const raw = settings.pixelIds;
  const pixelIds = (Array.isArray(raw) ? raw : String(raw || "").split(","))
    .map((s) => String(s).trim())
    .filter(Boolean);
  if (!pixelIds.length) return;

  function fire(eventName, eventId, url, custom) {
    pixelIds.forEach((id) => {
      const params = new URLSearchParams({
        id,
        ev: eventName,
        dl: url || "",
        rl: "",
        if: "false",
        ts: String(Date.now()),
        eid: eventId, // dedup key shared with server CAPI (e.g. order-<id>)
        noscript: "1",
      });
      if (custom?.currency) params.set("cd[currency]", custom.currency);
      if (custom?.value != null) params.set("cd[value]", String(custom.value));
      // no-cors: fire-and-forget beacon; keepalive so it survives navigation.
      fetch(`https://www.facebook.com/tr/?${params.toString()}`, {
        method: "GET",
        mode: "no-cors",
        keepalive: true,
      }).catch(() => {});
    });
  }

  const href = (event) => event?.context?.document?.location?.href || "";

  analytics.subscribe("page_viewed", (event) => {
    fire("PageView", event.id, href(event));
  });

  analytics.subscribe("product_viewed", (event) => {
    fire("ViewContent", event.id, href(event));
  });

  analytics.subscribe("product_added_to_cart", (event) => {
    fire("AddToCart", event.id, href(event));
  });

  analytics.subscribe("checkout_started", (event) => {
    fire("InitiateCheckout", event.id, href(event));
  });

  analytics.subscribe("checkout_completed", (event) => {
    const checkout = event?.data?.checkout;
    const orderId = checkout?.order?.id;
    fire("Purchase", orderId ? `order-${orderId}` : event.id, href(event), {
      currency: checkout?.totalPrice?.currencyCode,
      value: checkout?.totalPrice?.amount,
    });
  });
});
