---
name: facebook-capi
description: Use when building or debugging Facebook Conversions API (CAPI) server-side events — event payload schema, PII SHA-256 hashing, browser/server deduplication, and the Graph API endpoint.
---

# Facebook Conversions API (CAPI)

## Endpoint
`POST https://graph.facebook.com/v19.0/{PIXEL_ID}/events?access_token={TOKEN}`

Body:
```json
{
  "data": [{
    "event_name": "Purchase",
    "event_time": 1719500000,
    "event_id": "<shared-with-browser-for-dedup>",
    "action_source": "website",
    "event_source_url": "https://shop.example/checkout",
    "user_data": { "em": ["<sha256>"], "ph": ["<sha256>"], "client_ip_address": "...", "client_user_agent": "..." },
    "custom_data": { "currency": "USD", "value": 49.0 }
  }],
  "test_event_code": "TEST12345"
}
```

## PII hashing
- Hash email/phone/name/zip with **SHA-256** of the **lowercased, trimmed** value.
- Do NOT hash `client_ip_address`, `client_user_agent`, `event_id`, `fbc`, `fbp`.

## Deduplication
- Browser pixel and CAPI must send the **same `event_id`** and `event_name` for
  the same user action. Facebook dedupes within a window.

## Standard events
PageView, ViewContent, AddToCart, InitiateCheckout, Purchase.

## Errors
- 190 = invalid/expired access token. 100 = bad param. Log and surface to merchant.
