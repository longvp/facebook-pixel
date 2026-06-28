# User Stories — Facebook Pixel & CAPI Manager

Derived from the spec (`docs/superpowers/specs/2026-06-28-facebook-pixel-capi-app-design.md`)
and plan (`docs/superpowers/plans/2026-06-28-facebook-pixel-capi-app.md`).
Role: **merchant** (Shopify store owner using the embedded app).

---

## US-1: View pixels
**As a** merchant, **I want** to see all my Facebook pixels in a list, **so that** I can manage them at a glance.

**Acceptance criteria**
- Given I open the app, When the list loads, Then I see a table with columns: Active, Pixel ID, Pixel name, Pages, Conversion API, Actions.
- Given I have no pixels, When the list loads, Then I see an empty state "No pixels found".
- Given a pixel exists, Then its Pages column shows a badge: "All pages" / "Selected pages" / "Excluded pages" matching its tracking mode.

## US-2: Search pixels
**As a** merchant, **I want** to search by pixel name or ID, **so that** I can find a pixel quickly.

**Acceptance criteria**
- Given the list has pixels, When I type in the search box, Then the table filters to rows whose name contains the query (case-insensitive) or whose Pixel ID contains the query.
- Given no row matches, Then the empty state is shown.

## US-3: Add a pixel
**As a** merchant, **I want** to add a new pixel with a name and Pixel ID, **so that** I can start tracking.

**Acceptance criteria**
- Given I click "Add pixel", Then I see the add form titled "Add Facebook pixel".
- Given I submit without a name or Pixel ID, Then I see a validation error and nothing is saved.
- Given name ≤255 chars and Pixel ID ≤20 chars, Then character counters reflect input length.
- Given I create a pixel whose Pixel ID already exists for my shop, Then I see a "duplicate" warning and nothing is saved.
- Given a valid form, When I save, Then the pixel is created (active by default) and I return to the list where it appears.

## US-4: Edit a pixel
**As a** merchant, **I want** to edit a pixel's name, tracking mode, and CAPI settings, **so that** I can keep it correct.

**Acceptance criteria**
- Given I click Edit, Then I see the form titled "Edit Facebook pixel" pre-filled with current values.
- Given I am editing, Then the Pixel ID field is disabled (immutable) and shows helper text.
- Given I change the name/tracking/CAPI and save, Then changes persist and I return to the list.
- Given the pixel already has a stored token, When I leave the token field blank and save, Then the existing token is preserved.

## US-5: Delete a pixel
**As a** merchant, **I want** to delete a pixel with confirmation, **so that** I don't remove one by accident.

**Acceptance criteria**
- Given I click Delete, Then a confirmation modal appears ("This action cannot be undone").
- Given I confirm, Then the pixel is removed, the list updates, and a toast confirms deletion.
- Given I cancel, Then nothing is deleted.

## US-6: Toggle active/inactive
**As a** merchant, **I want** to turn a pixel on/off from the list, **so that** I can pause tracking without deleting.

**Acceptance criteria**
- Given a pixel row, When I toggle Active, Then its `active` state persists and a toast confirms.
- Given a pixel is inactive, Then it fires no browser or server events.

## US-7: Enable/disable CAPI
**As a** merchant, **I want** to enable the Conversions API per pixel with an access token, **so that** I can track server-side beyond browser limits.

**Acceptance criteria**
- Given the CAPI toggle, When I enable it without a stored access token, Then I see a warning, the toggle reverts, and CAPI stays disabled.
- Given a valid access token is saved, When I enable CAPI, Then `capiEnabled` persists and a toast confirms.
- Given a token is stored, Then it is encrypted at rest (never stored or returned in plaintext).
- Given the form, Then I can optionally set a Test event code (≤20 chars) with a warning to remove it after testing.

## US-8: Choose tracking pages
**As a** merchant, **I want** to choose which pages a pixel tracks (All / Selected / Excluded), **so that** I control coverage.

**Acceptance criteria**
- Given the form, Then I can pick exactly one of: All pages / Selected page / Excluded page.
- Given I save a mode, Then the list badge reflects it.
- (Open item) Given Selected/Excluded, Then a page picker lets me choose specific pages — see `questions.md`; until decided, behaves like All.

## US-9: Browser-side tracking (Web Pixel Extension)
**As a** merchant, **I want** browser events sent to my active pixels, **so that** standard funnel events are captured.

**Acceptance criteria**
- Given active pixels, When a shopper views a page/product, adds to cart, starts/completes checkout, Then the corresponding standard event (PageView, ViewContent, AddToCart, InitiateCheckout, Purchase) fires to each active pixel.
- Given a Purchase, Then the browser event carries an `eventID` of `order-<id>` to deduplicate with the server CAPI event.

## US-10: Server-side Purchase via CAPI
**As a** merchant, **I want** purchases sent server-side through CAPI, **so that** conversions are tracked even when the browser is blocked.

**Acceptance criteria**
- Given an order is created, When the `orders/create` webhook fires, Then for each active, CAPI-enabled pixel a Purchase event is sent to the Graph API with the decrypted token.
- Given the event, Then PII (email/phone) is SHA-256 hashed (lowercased+trimmed) and `event_id` is `order-<id>` (matches the browser event).
- Given a Test event code is set, Then it is included in the request.
- Given the send fails, Then the error is logged and the webhook still returns 200.
