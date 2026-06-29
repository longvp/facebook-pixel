import { register } from "@shopify/web-pixels-extension";

const PROXY_SUBPATH = "/apps/fbpixel/capi";

// Each setting is a JSON-encoded array string (Shopify settings fields are
// strings). Parse back to string[]; tolerate a raw array or CSV too.
function parseList(raw) {
  let parsed = raw;
  if (typeof raw === "string") {
    try {
      parsed = JSON.parse(raw);
    } catch {
      parsed = raw.split(",");
    }
  }
  return (Array.isArray(parsed) ? parsed : String(parsed || "").split(","))
    .map((s) => String(s).trim())
    .filter(Boolean);
}

register(({ analytics, browser, settings, init }) => {
  // Browser beacon fires for every active pixel; CAPI only for CAPI-enabled ones.
  const clientIds = parseList(settings.listPixelClient);
  const capiIds = parseList(settings.listPixelCapi);
  // DEBUG: inspect the settings the web pixel actually received (storefront console).
  console.log("[web-pixel-fb] settings", {
    raw: settings,
    listPixelClient: settings.listPixelClient,
    listPixelCapi: settings.listPixelCapi,
    clientIds,
    capiIds,
  });
  if (!clientIds.length && !capiIds.length) return;

  const userAgent = init?.context?.navigator?.userAgent || "";

  function fire(eventName, eventId, url, custom) {
    clientIds.forEach((id) => {
      const params = new URLSearchParams({
        id,
        ev: eventName,
        dl: url || "",
        rl: "",
        if: "false",
        ts: String(Date.now()),
        eid: eventId,
        noscript: "1",
      });
      if (custom?.currency) params.set("cd[currency]", custom.currency);
      if (custom?.value != null) params.set("cd[value]", String(custom.value));
      fetch(`https://www.facebook.com/tr/?${params.toString()}`, {
        method: "GET",
        mode: "no-cors",
        keepalive: true,
      }).catch(() => {});
    });
  }

  async function sendCapi(eventName, eventId, url, custom, extra) {
    if (!capiIds.length || !url) return;
    let origin = "";
    try {
      origin = new URL(url).origin;
    } catch {
      return;
    }
    const [fbp, fbc] = await Promise.all([
      browser.cookie.get("_fbp").catch(() => ""),
      browser.cookie.get("_fbc").catch(() => ""),
    ]);
    fetch(`${origin}${PROXY_SUBPATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        eventName,
        eventId,
        url,
        userAgent,
        fbp,
        fbc,
        currency: custom?.currency,
        value: custom?.value != null ? Number(custom.value) : undefined,
        ...(extra || {}),
      }),
    }).catch(() => {});
  }

  function track(eventName, event, custom, extra) {
    const url = event?.context?.document?.location?.href || "";
    const eventId = event.id;
    fire(eventName, eventId, url, custom);
    sendCapi(eventName, eventId, url, custom, extra);
  }

  analytics.subscribe("page_viewed", (e) => track("PageView", e));
  analytics.subscribe("product_viewed", (e) => track("ViewContent", e));
  analytics.subscribe("product_added_to_cart", (e) => track("AddToCart", e));
  analytics.subscribe("checkout_started", (e) => track("InitiateCheckout", e));
  analytics.subscribe("checkout_completed", (e) => {
    const checkout = e?.data?.checkout;
    const orderId = checkout?.order?.id;
    const email = checkout?.email || checkout?.order?.customer?.email || undefined;
    const phone = checkout?.phone || undefined;
    track(
      "Purchase",
      { ...e, id: orderId ? `order-${orderId}` : e.id },
      { currency: checkout?.totalPrice?.currencyCode, value: checkout?.totalPrice?.amount },
      { email, phone },
    );
  });
});
