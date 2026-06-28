# Facebook Pixel & CAPI Manager — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Shopify embedded app (Node + Remix + Polaris) that lets a merchant CRUD Facebook Pixels, enable the Conversions API (CAPI) per pixel with an encrypted access token, and toggle each pixel active/inactive — plus the `.claude` tooling and flow that drive its development.

**Architecture:** A standalone Remix app persists pixels in MySQL via Prisma. Browser events fire through a Web Pixel Extension; server-side events fire through the Facebook Conversions API driven by Shopify webhooks, deduplicated via a shared `event_id`. The UI is rebuilt with real Polaris components from the approved mockup `docs/ui/pixel-app-ui.html`.

**Tech Stack:** Node 18+, Remix, Shopify App Remix template, Polaris (`@shopify/polaris`), Prisma ORM, MySQL, `@shopify/shopify-app-remix`, Web Pixel Extension, Vitest for tests.

## Global Constraints

- Node version floor: **18.20+** (Shopify CLI requirement).
- Database: **MySQL** only (Prisma `provider = "mysql"`). Managed via MySQL Workbench.
- UI built with **`@shopify/polaris`** components — match layout/copy/behavior of `docs/ui/pixel-app-ui.html`. No hand-rolled CSS clones of Polaris.
- `accessToken` is **encrypted at rest** (AES-256-GCM) and **never** returned to the client in plaintext.
- Pixel ID is **unique per shop** and **immutable after create**.
- Enabling CAPI requires a saved access token first; otherwise warn and revert.
- Standard events only at first: PageView, ViewContent, AddToCart, InitiateCheckout, Purchase.
- Flow commands write their outputs under `docs/flow/`.
- All secrets via env vars; never commit `.env`. Encryption key env: `APP_ENCRYPTION_KEY` (32-byte base64).
- Tests: **Vitest**. Test files end in `.test.ts`.

---

## File Structure

**`.claude` tooling (Phase 0):**
- `CLAUDE.md` — project conventions, stack, structure, common commands, the 6-step flow.
- `.claude/settings.json` — hooks (Prettier on save) + permission allowlist.
- `.claude/commands/{brainstorm,plan,userstories,classify,execute,verify}.md` — flow slash commands.
- `.claude/skills/facebook-capi/SKILL.md` — CAPI event schema, PII hashing, dedup, Graph API reference.
- `.claude/skills/shopify-remix-patterns/SKILL.md` — loader/action/webhook/Polaris patterns.
- `docs/flow/.gitkeep` — output dir for flow phases.

**App (Phases 1–4, created relative to scaffold root):**
- `prisma/schema.prisma` — `Session` (template) + `Pixel` model.
- `app/lib/crypto.server.ts` — AES-256-GCM encrypt/decrypt for tokens.
- `app/models/pixel.server.ts` — Pixel CRUD + token encrypt/decrypt + validation.
- `app/lib/capi.server.ts` — build + send Conversions API events.
- `app/routes/app._index.tsx` — pixel list screen.
- `app/routes/app.pixels.new.tsx` — add screen.
- `app/routes/app.pixels.$id.tsx` — edit screen (Pixel ID immutable).
- `app/routes/app.pixels.$id.toggle.tsx` — resource route for active/CAPI toggles.
- `app/routes/webhooks.orders.create.tsx` — Purchase CAPI event.
- `extensions/web-pixel-fb/` — Web Pixel Extension (browser events + dedup).
- `app/lib/*.test.ts`, `app/models/*.test.ts` — Vitest unit tests.

---

## Phase 0 — `.claude` Tooling & Flow

### Task 1: CLAUDE.md

**Files:**
- Create: `CLAUDE.md`

**Interfaces:**
- Produces: project conventions consumed by every later task and by Claude sessions.

- [ ] **Step 1: Write `CLAUDE.md`**

```markdown
# Facebook Pixel & CAPI — Shopify Embedded App

Shopify embedded app to manage Facebook Pixels & the Conversions API (CAPI).

## Stack
- Node 18.20+, Remix, Shopify App Remix template
- UI: Polaris (`@shopify/polaris`) + App Bridge
- DB: MySQL via Prisma
- Tracking: Web Pixel Extension (browser) + server-side CAPI (webhooks)
- Tests: Vitest

## Structure
- `app/routes/` — Remix routes (loaders/actions). `app.*` = embedded admin pages.
- `app/models/` — data access (Prisma). `*.server.ts` = server-only.
- `app/lib/` — crypto, CAPI client, helpers.
- `extensions/web-pixel-fb/` — Web Pixel Extension.
- `prisma/schema.prisma` — DB schema.
- `docs/superpowers/` — specs & plans. `docs/flow/` — flow outputs. `docs/ui/` — UI mockup.

## Common commands
- `npm run dev` / `shopify app dev` — run app against a dev store
- `npx prisma migrate dev --name <x>` — create + apply migration
- `npx prisma studio` — browse data
- `npm test` — run Vitest
- `npm run lint` — ESLint

## Conventions
- Server-only code lives in `*.server.ts`. Never import a `.server.ts` into client code.
- All data access goes through `app/models/`. Routes call models, not Prisma directly.
- `accessToken` is encrypted at rest (AES-256-GCM, `app/lib/crypto.server.ts`) and never sent to the client in plaintext.
- Pixel ID is unique per shop and immutable after create.
- Match the approved UI in `docs/ui/pixel-app-ui.html` using real Polaris components.

## Development flow (slash commands)
`/brainstorm` → `/plan` → `/userstories` → `/classify` → `/execute` → `/verify`.
Each writes its output under `docs/flow/`. See `.claude/commands/`.
```

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: add CLAUDE.md project guide"
```

---

### Task 2: `.claude/settings.json` (hooks + permissions)

**Files:**
- Create: `.claude/hooks/format.mjs` (the formatter script the hook calls)
- Create: `.claude/settings.json`

**Interfaces:**
- Produces: a `PostToolUse` hook that formats edited TS/TSX with Prettier via a
  standalone script; a permission allowlist for `npm`/`npx`/`shopify`/`prisma`/`node`.

- [ ] **Step 1: Write `.claude/hooks/format.mjs`**

The PostToolUse hook receives the tool call as JSON on **stdin**
(`tool_input.file_path`). Keeping the logic in a script file avoids fragile
multi-layer escaping inside settings.json.

```js
// .claude/hooks/format.mjs
// PostToolUse hook: format edited .ts/.tsx files with Prettier.
import { execSync } from "node:child_process";

let raw = "";
process.stdin.on("data", (d) => (raw += d));
process.stdin.on("end", () => {
  try {
    const file = JSON.parse(raw || "{}")?.tool_input?.file_path || "";
    if (/\.(ts|tsx)$/.test(file)) {
      execSync(`npx prettier --write "${file}"`, { stdio: "ignore" });
    }
  } catch {
    // Never block the tool call on a formatting failure.
  }
});
```

- [ ] **Step 2: Write `.claude/settings.json`**

```json
{
  "permissions": {
    "allow": [
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(shopify:*)",
      "Bash(prisma:*)"
    ]
  },
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Edit|Write",
        "hooks": [
          {
            "type": "command",
            "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/format.mjs\""
          }
        ]
      }
    ]
  }
}
```

- [ ] **Step 3: Verify JSON is valid**

Run: `node -e "JSON.parse(require('fs').readFileSync('.claude/settings.json','utf8')); console.log('ok')"`
Expected: `ok`

- [ ] **Step 4: Commit**

```bash
git add .claude/settings.json .claude/hooks/format.mjs
git commit -m "chore: add Claude settings with Prettier hook and permissions"
```

---

### Task 3: Flow slash commands

**Files:**
- Create: `.claude/commands/brainstorm.md`
- Create: `.claude/commands/plan.md`
- Create: `.claude/commands/userstories.md`
- Create: `.claude/commands/classify.md`
- Create: `.claude/commands/execute.md`
- Create: `.claude/commands/verify.md`

**Interfaces:**
- Produces: six invokable commands. `/classify` writes `docs/flow/complex-cases.md` and `docs/flow/questions.md`.

- [ ] **Step 1: Write `.claude/commands/brainstorm.md`**

```markdown
---
description: Phase 1 — explore intent, constraints, and design before any code.
---
You are in the BRAINSTORM phase for: $ARGUMENTS

Goal: turn the idea into a clear design. Ask clarifying questions ONE at a time,
propose 2-3 approaches with trade-offs, then present a design for approval.

Do NOT write implementation code. When approved, write the design to
`docs/superpowers/specs/YYYY-MM-DD-<topic>-design.md`, then suggest `/plan`.
```

- [ ] **Step 2: Write `.claude/commands/plan.md`**

```markdown
---
description: Phase 2 — turn an approved spec into a step-by-step implementation plan.
---
You are in the PLAN phase for: $ARGUMENTS

Read the relevant spec under `docs/superpowers/specs/`. Produce a bite-sized,
TDD, fully-coded plan at `docs/superpowers/plans/YYYY-MM-DD-<feature>.md`:
file structure, tasks with exact paths, failing test → impl → passing test →
commit. No placeholders. End by suggesting `/userstories`.
```

- [ ] **Step 3: Write `.claude/commands/userstories.md`**

```markdown
---
description: Phase 3 — derive user stories with acceptance criteria from the plan/spec.
---
You are in the USER STORIES phase for: $ARGUMENTS

From the spec + plan, write user stories to `docs/flow/user-stories.md`.
Format each as: `As a <role>, I want <goal>, so that <benefit>.` with a
bulleted **Acceptance criteria** list (Given/When/Then). Cover every feature in
the spec. End by suggesting `/classify`.
```

- [ ] **Step 4: Write `.claude/commands/classify.md`**

```markdown
---
description: Phase 4 — classify tasks into now/complex/discuss; output complex-cases & questions.
---
You are in the CLASSIFY phase for: $ARGUMENTS

Read `docs/flow/user-stories.md` and the plan. Classify every task into:
- **now** — well-understood, safe to implement immediately.
- **complex** — large or risky; needs decomposition or a spike.
- **discuss** — blocked on an open product/technical decision.

Write three outputs:
1. `docs/flow/classification.md` — a table: task | group | reason.
2. `docs/flow/complex-cases.md` — each complex task with why it's complex and a
   proposed breakdown/spike.
3. `docs/flow/questions.md` — each discuss item as a concrete question with options.

End by suggesting `/execute` for the `now` tasks.
```

- [ ] **Step 5: Write `.claude/commands/execute.md`**

```markdown
---
description: Phase 5 — implement the plan task-by-task with TDD and frequent commits.
---
You are in the EXECUTE phase for: $ARGUMENTS

Implement the `now` tasks from `docs/superpowers/plans/` following the plan
exactly. Use TDD: failing test → minimal impl → passing test → commit. Prefer
the superpowers:subagent-driven-development or executing-plans skill. Stop and
ask if you hit a `discuss` item. End by suggesting `/verify`.
```

- [ ] **Step 6: Write `.claude/commands/verify.md`**

```markdown
---
description: Phase 6 — verify the work against acceptance criteria with real evidence.
---
You are in the VERIFY phase for: $ARGUMENTS

Run the full test suite, lint, and (where possible) the app. For each user story
in `docs/flow/user-stories.md`, confirm acceptance criteria with EVIDENCE
(command output, not assertions). Write results to `docs/flow/verification.md`
as a checklist with pass/fail + evidence. Use superpowers:verification-before-completion.
```

- [ ] **Step 7: Commit**

```bash
git add .claude/commands
git commit -m "feat: add 6 flow slash commands (brainstorm..verify)"
```

---

### Task 4: Project skills

**Files:**
- Create: `.claude/skills/facebook-capi/SKILL.md`
- Create: `.claude/skills/shopify-remix-patterns/SKILL.md`

**Interfaces:**
- Produces: domain reference skills auto-loaded by description match.

- [ ] **Step 1: Write `.claude/skills/facebook-capi/SKILL.md`**

```markdown
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
```

- [ ] **Step 2: Write `.claude/skills/shopify-remix-patterns/SKILL.md`**

```markdown
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
```

- [ ] **Step 3: Commit**

```bash
git add .claude/skills docs/flow/.gitkeep
git commit -m "feat: add facebook-capi and shopify-remix-patterns skills"
```

> Note: create `docs/flow/.gitkeep` in this step (`mkdir -p docs/flow && touch docs/flow/.gitkeep`) so the flow output dir is tracked.

---

## Phase 1 — Scaffold & Database

### Task 5: Scaffold the Shopify Remix app (interactive — user-assisted)

**Files:**
- Create: scaffold output (package.json, vite/remix config, `app/`, `prisma/`, `shopify.app.toml`, etc.)

**Interfaces:**
- Produces: a runnable Shopify Remix app skeleton that all later tasks modify.

- [ ] **Step 1: Run the Shopify CLI scaffold (USER runs — interactive)**

This step is interactive (Partner login in browser + template prompts), so the
user runs it in the session via the `!` prefix:

```
!npm init @shopify/app@latest -- --template=remix
```

When prompted: choose the **Remix** template and the **Prisma** (SQLite default)
storage option. Name the app (e.g. `facebook-pixel`). This creates the app in a
subfolder; move its contents into the project root if needed.

Expected: a new app directory with `package.json`, `app/`, `prisma/schema.prisma`,
`shopify.app.toml`, and `npm install` already run.

- [ ] **Step 2: Verify the dev toolchain installs and builds**

Run: `npm install && npm run build`
Expected: build completes without errors.

- [ ] **Step 3: Add Vitest for unit tests**

Run: `npm i -D vitest @vitest/coverage-v8`
Then add to `package.json` `"scripts"`: `"test": "vitest run"`, `"test:watch": "vitest"`.

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "chore: scaffold Shopify Remix app + add Vitest"
```

---

### Task 6: Switch Prisma to MySQL + add Pixel model

**Files:**
- Modify: `prisma/schema.prisma`
- Modify: `.env` (DATABASE_URL — not committed) and `.env.example` (committed)

**Interfaces:**
- Produces: `Pixel` table, consumed by `app/models/pixel.server.ts`.

- [ ] **Step 1: Set the datasource to MySQL in `prisma/schema.prisma`**

```prisma
datasource db {
  provider = "mysql"
  url      = env("DATABASE_URL")
}
```

- [ ] **Step 2: Add the model to `prisma/schema.prisma`**

```prisma
model Pixel {
  id            String       @id @default(cuid())
  shop          String       @db.VarChar(255)
  name          String       @db.VarChar(255)
  pixelId       String       @db.VarChar(32)
  capiEnabled   Boolean      @default(false)
  accessToken   String?      @db.Text
  testEventCode String?      @db.VarChar(32)
  active        Boolean      @default(true)
  createdAt     DateTime     @default(now())
  updatedAt     DateTime     @updatedAt

  @@unique([shop, pixelId])
  @@index([shop])
}
```

- [ ] **Step 3: Set `DATABASE_URL` and create the database**

Add to `.env`:
```
DATABASE_URL="mysql://root:@127.0.0.1:3306/facebook_pixel"
APP_ENCRYPTION_KEY="<base64 32-byte key>"
```
Add the same keys (with placeholder values) to `.env.example`.
Create the DB (via MySQL Workbench or CLI): `CREATE DATABASE facebook_pixel;`
Generate a key: `node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"`

- [ ] **Step 4: Run the migration**

Run: `npx prisma migrate dev --name add_pixel_model`
Expected: migration applied; `Pixel` table exists. Verify in MySQL Workbench.

- [ ] **Step 5: Commit**

```bash
git add prisma .env.example
git commit -m "feat: switch Prisma to MySQL and add Pixel model"
```

---

## Phase 2 — Backend Core (unit-tested)

### Task 7: AES-256-GCM token encryption

**Files:**
- Create: `app/lib/crypto.server.ts`
- Test: `app/lib/crypto.server.test.ts`

**Interfaces:**
- Produces: `encrypt(plain: string): string` and `decrypt(payload: string): string`. Ciphertext format: base64 of `iv(12) || authTag(16) || ciphertext`. Key from `APP_ENCRYPTION_KEY` (base64, 32 bytes).

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/crypto.server.test.ts
import { describe, it, expect, beforeAll } from "vitest";
import { encrypt, decrypt } from "./crypto.server";

beforeAll(() => {
  process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

describe("crypto", () => {
  it("round-trips a value", () => {
    const out = encrypt("super-secret-token");
    expect(out).not.toContain("super-secret-token");
    expect(decrypt(out)).toBe("super-secret-token");
  });

  it("produces different ciphertext each call (random IV)", () => {
    expect(encrypt("x")).not.toBe(encrypt("x"));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- crypto`
Expected: FAIL — cannot find module `./crypto.server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/lib/crypto.server.ts
import crypto from "node:crypto";

function key(): Buffer {
  const k = process.env.APP_ENCRYPTION_KEY;
  if (!k) throw new Error("APP_ENCRYPTION_KEY is not set");
  const buf = Buffer.from(k, "base64");
  if (buf.length !== 32) throw new Error("APP_ENCRYPTION_KEY must be 32 bytes (base64)");
  return buf;
}

export function encrypt(plain: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, enc]).toString("base64");
}

export function decrypt(payload: string): string {
  const raw = Buffer.from(payload, "base64");
  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const enc = raw.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(enc), decipher.final()]).toString("utf8");
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- crypto`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/crypto.server.ts app/lib/crypto.server.test.ts
git commit -m "feat: add AES-256-GCM token encryption"
```

---

### Task 8: Pixel data-access model

**Files:**
- Create: `app/models/pixel.server.ts`
- Test: `app/models/pixel.server.test.ts`

**Interfaces:**
- Consumes: `encrypt`/`decrypt` from `app/lib/crypto.server.ts`; `prisma` from `app/db.server.ts` (scaffold default export).
- Produces:
  - `listPixels(shop): Promise<PixelView[]>`
  - `getPixel(shop, id): Promise<PixelView | null>`
  - `createPixel(shop, input: PixelInput): Promise<PixelView>`
  - `updatePixel(shop, id, input: Partial<PixelInput>): Promise<PixelView>`
  - `deletePixel(shop, id): Promise<void>`
  - `setActive(shop, id, active: boolean): Promise<PixelView>`
  - `setCapiEnabled(shop, id, enabled: boolean): Promise<PixelView>` (throws if enabling without a stored token)
  - `getDecryptedToken(shop, id): Promise<string | null>` (server-only; never sent to client)
  - Types: `PixelInput = { name; pixelId; capiEnabled; accessToken?; testEventCode? }`; `PixelView` = pixel fields **minus** `accessToken`, plus `hasAccessToken: boolean`.

- [ ] **Step 1: Write the failing test (validation + token redaction)**

```ts
// app/models/pixel.server.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("../db.server", () => {
  const rows: any[] = [];
  return {
    default: {
      pixel: {
        create: vi.fn(async ({ data }) => { const r = { id: "p1", ...data }; rows.push(r); return r; }),
        findMany: vi.fn(async () => rows),
        findFirst: vi.fn(async ({ where }) => rows.find(r => r.id === where.id) ?? null),
        update: vi.fn(async ({ where, data }) => { const r = rows.find(x => x.id === where.id); Object.assign(r, data); return r; }),
        delete: vi.fn(async () => {}),
      },
    },
  };
});

import { createPixel, setCapiEnabled } from "./pixel.server";

beforeEach(() => { process.env.APP_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64"); });

describe("pixel model", () => {
  it("redacts the access token in the returned view", async () => {
    const view: any = await createPixel("s.myshopify.com", {
      name: "P", pixelId: "123", capiEnabled: true, accessToken: "tok",
    });
    expect(view.accessToken).toBeUndefined();
    expect(view.hasAccessToken).toBe(true);
  });

  it("refuses to enable CAPI without a stored token", async () => {
    const p: any = await createPixel("s.myshopify.com", {
      name: "Q", pixelId: "999", capiEnabled: false,
    });
    await expect(setCapiEnabled("s.myshopify.com", p.id, true)).rejects.toThrow(/access token/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- pixel`
Expected: FAIL — cannot find module `./pixel.server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/models/pixel.server.ts
import prisma from "../db.server";
import { encrypt, decrypt } from "../lib/crypto.server";

export type PixelInput = {
  name: string;
  pixelId: string;
  capiEnabled: boolean;
  accessToken?: string;
  testEventCode?: string | null;
};

export type PixelView = {
  id: string; shop: string; name: string; pixelId: string;
  capiEnabled: boolean; hasAccessToken: boolean;
  testEventCode: string | null; active: boolean;
  createdAt: Date; updatedAt: Date;
};

function toView(p: any): PixelView {
  const { accessToken, ...rest } = p;
  return {
    ...rest,
    hasAccessToken: Boolean(accessToken),
  };
}

export async function listPixels(shop: string): Promise<PixelView[]> {
  const rows = await prisma.pixel.findMany({ where: { shop }, orderBy: { createdAt: "desc" } });
  return rows.map(toView);
}

export async function getPixel(shop: string, id: string): Promise<PixelView | null> {
  const p = await prisma.pixel.findFirst({ where: { id, shop } });
  return p ? toView(p) : null;
}

export async function createPixel(shop: string, input: PixelInput): Promise<PixelView> {
  if (!input.name?.trim()) throw new Error("Pixel name is required");
  if (!input.pixelId?.trim()) throw new Error("Pixel ID is required");
  if (input.capiEnabled && !input.accessToken) throw new Error("An access token is required to enable CAPI");
  const p = await prisma.pixel.create({
    data: {
      shop,
      name: input.name.trim(),
      pixelId: input.pixelId.trim(),
      capiEnabled: input.capiEnabled,
      testEventCode: input.testEventCode ?? null,
      accessToken: input.accessToken ? encrypt(input.accessToken) : null,
    },
  });
  return toView(p);
}

export async function updatePixel(shop: string, id: string, input: Partial<PixelInput>): Promise<PixelView> {
  const existing = await prisma.pixel.findFirst({ where: { id, shop } });
  if (!existing) throw new Error("Pixel not found");
  const data: any = {};
  if (input.name !== undefined) data.name = input.name.trim();
  if (input.testEventCode !== undefined) data.testEventCode = input.testEventCode;
  if (input.accessToken) data.accessToken = encrypt(input.accessToken);
  if (input.capiEnabled !== undefined) {
    const hasToken = input.accessToken || existing.accessToken;
    if (input.capiEnabled && !hasToken) throw new Error("An access token is required to enable CAPI");
    data.capiEnabled = input.capiEnabled;
  }
  // pixelId is immutable — intentionally never written here.
  const p = await prisma.pixel.update({ where: { id }, data });
  return toView(p);
}

export async function deletePixel(shop: string, id: string): Promise<void> {
  const existing = await prisma.pixel.findFirst({ where: { id, shop } });
  if (!existing) throw new Error("Pixel not found");
  await prisma.pixel.delete({ where: { id } });
}

export async function setActive(shop: string, id: string, active: boolean): Promise<PixelView> {
  const existing = await prisma.pixel.findFirst({ where: { id, shop } });
  if (!existing) throw new Error("Pixel not found");
  return toView(await prisma.pixel.update({ where: { id }, data: { active } }));
}

export async function setCapiEnabled(shop: string, id: string, enabled: boolean): Promise<PixelView> {
  const existing = await prisma.pixel.findFirst({ where: { id, shop } });
  if (!existing) throw new Error("Pixel not found");
  if (enabled && !existing.accessToken) throw new Error("An access token is required to enable CAPI");
  return toView(await prisma.pixel.update({ where: { id }, data: { capiEnabled: enabled } }));
}

export async function getDecryptedToken(shop: string, id: string): Promise<string | null> {
  const p = await prisma.pixel.findFirst({ where: { id, shop } });
  return p?.accessToken ? decrypt(p.accessToken) : null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- pixel`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add app/models/pixel.server.ts app/models/pixel.server.test.ts
git commit -m "feat: add Pixel data-access model with token redaction"
```

---

### Task 9: CAPI event builder + sender

**Files:**
- Create: `app/lib/capi.server.ts`
- Test: `app/lib/capi.server.test.ts`

**Interfaces:**
- Produces:
  - `hashPII(value: string): string` — SHA-256 of lowercased+trimmed value.
  - `buildEvent(input: CapiEventInput): CapiEvent` — builds one event object (hashes em/ph, passes ip/ua/event_id raw).
  - `sendEvents(pixelId, accessToken, events: CapiEvent[], testEventCode?): Promise<{ ok: boolean; status: number; body: any }>` — POSTs to Graph API.
  - Types: `CapiEventInput = { eventName; eventTime; eventId; sourceUrl?; email?; phone?; clientIp?; userAgent?; currency?; value? }`.

- [ ] **Step 1: Write the failing test**

```ts
// app/lib/capi.server.test.ts
import { describe, it, expect, vi } from "vitest";
import crypto from "node:crypto";
import { hashPII, buildEvent, sendEvents } from "./capi.server";

const sha = (v: string) => crypto.createHash("sha256").update(v).digest("hex");

describe("capi", () => {
  it("hashes lowercased, trimmed PII", () => {
    expect(hashPII("  Foo@Bar.com ")).toBe(sha("foo@bar.com"));
  });

  it("builds an event with hashed email and raw event_id", () => {
    const e = buildEvent({
      eventName: "Purchase", eventTime: 100, eventId: "evt-1",
      email: "a@b.com", currency: "USD", value: 9.5,
    });
    expect(e.event_name).toBe("Purchase");
    expect(e.event_id).toBe("evt-1");
    expect(e.user_data.em).toEqual([sha("a@b.com")]);
    expect(e.custom_data).toEqual({ currency: "USD", value: 9.5 });
  });

  it("POSTs to the graph endpoint with the pixel id", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ events_received: 1 }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);
    const res = await sendEvents("PIX123", "tok", [buildEvent({ eventName: "PageView", eventTime: 1, eventId: "x" })], "TEST1");
    expect(res.ok).toBe(true);
    const url = fetchMock.mock.calls[0][0] as string;
    expect(url).toContain("/PIX123/events");
    expect(url).toContain("access_token=tok");
    const body = JSON.parse((fetchMock.mock.calls[0][1] as any).body);
    expect(body.test_event_code).toBe("TEST1");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- capi`
Expected: FAIL — cannot find module `./capi.server`.

- [ ] **Step 3: Write minimal implementation**

```ts
// app/lib/capi.server.ts
import crypto from "node:crypto";

const API_VERSION = "v19.0";

export type CapiEventInput = {
  eventName: string;
  eventTime: number;
  eventId: string;
  sourceUrl?: string;
  email?: string;
  phone?: string;
  clientIp?: string;
  userAgent?: string;
  currency?: string;
  value?: number;
};

export type CapiEvent = {
  event_name: string;
  event_time: number;
  event_id: string;
  action_source: "website";
  event_source_url?: string;
  user_data: Record<string, unknown>;
  custom_data?: Record<string, unknown>;
};

export function hashPII(value: string): string {
  return crypto.createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

export function buildEvent(input: CapiEventInput): CapiEvent {
  const user_data: Record<string, unknown> = {};
  if (input.email) user_data.em = [hashPII(input.email)];
  if (input.phone) user_data.ph = [hashPII(input.phone)];
  if (input.clientIp) user_data.client_ip_address = input.clientIp;
  if (input.userAgent) user_data.client_user_agent = input.userAgent;

  const custom_data: Record<string, unknown> = {};
  if (input.currency) custom_data.currency = input.currency;
  if (input.value !== undefined) custom_data.value = input.value;

  const event: CapiEvent = {
    event_name: input.eventName,
    event_time: input.eventTime,
    event_id: input.eventId,
    action_source: "website",
    user_data,
  };
  if (input.sourceUrl) event.event_source_url = input.sourceUrl;
  if (Object.keys(custom_data).length) event.custom_data = custom_data;
  return event;
}

export async function sendEvents(
  pixelId: string,
  accessToken: string,
  events: CapiEvent[],
  testEventCode?: string | null,
): Promise<{ ok: boolean; status: number; body: any }> {
  const url = `https://graph.facebook.com/${API_VERSION}/${pixelId}/events?access_token=${encodeURIComponent(accessToken)}`;
  const payload: Record<string, unknown> = { data: events };
  if (testEventCode) payload.test_event_code = testEventCode;
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  return { ok: res.ok, status: res.status, body };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- capi`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add app/lib/capi.server.ts app/lib/capi.server.test.ts
git commit -m "feat: add CAPI event builder and Graph API sender"
```

---

## Phase 3 — UI (Polaris, per `docs/ui/pixel-app-ui.html`)

### Task 10: Pixel list screen

**Files:**
- Modify/Create: `app/routes/app._index.tsx`

**Interfaces:**
- Consumes: `listPixels`, `setActive`, `setCapiEnabled`, `deletePixel` from `app/models/pixel.server.ts`; `authenticate` from `app/shopify.server`.
- Produces: the list UI. Toggles + delete POST to this route's `action` with a `_action` field (`toggleActive` | `toggleCapi` | `delete`).

- [ ] **Step 1: Write the route**

```tsx
// app/routes/app._index.tsx
import { json, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useFetcher } from "@remix-run/react";
import {
  Page, Card, IndexTable, Button, TextField, Text,
  InlineStack, Checkbox, Modal, Frame, Toast, Link as PolarisLink,
} from "@shopify/polaris";
import { useEffect, useState } from "react";
import { authenticate } from "../shopify.server";
import { listPixels, setActive, setCapiEnabled, deletePixel } from "../models/pixel.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  return json({ pixels: await listPixels(session.shop) });
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const id = String(form.get("id"));
  const op = String(form.get("_action"));
  try {
    if (op === "toggleActive") await setActive(session.shop, id, form.get("value") === "true");
    if (op === "toggleCapi") await setCapiEnabled(session.shop, id, form.get("value") === "true");
    if (op === "delete") await deletePixel(session.shop, id);
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
  const [toast, setToast] = useState<string | null>(null);

  // Surface action results as Polaris Toasts.
  useEffect(() => {
    if (!fetcher.data) return;
    if (fetcher.data.ok) {
      const map: Record<string, string> = {
        toggleActive: "Pixel updated", toggleCapi: "CAPI updated", delete: "Pixel deleted",
      };
      setToast(map[(fetcher.data as any).op] ?? "Saved");
    } else {
      setToast((fetcher.data as any).error);
    }
  }, [fetcher.data]);

  const filtered = pixels.filter(
    (p) => p.name.toLowerCase().includes(query.toLowerCase()) || p.pixelId.includes(query),
  );

  const submit = (fields: Record<string, string>) => fetcher.submit(fields, { method: "post" });

  return (
    <Frame>
      <Page title="Facebook Pixel & CAPI" primaryAction={{ content: "Add pixel", url: "/app/pixels/new" }}>
        <Card padding="0">
          <div style={{ padding: "12px 16px" }}>
            <TextField label="Search" labelHidden value={query} onChange={setQuery}
              placeholder="Search by pixel name, pixel ID" autoComplete="off" />
          </div>
          <IndexTable
            itemCount={filtered.length}
            selectable={false}
            headings={[
              { title: "Active" }, { title: "Pixel ID" }, { title: "Pixel name" },
              { title: "Conversion API" }, { title: "Actions" },
            ]}
            emptyState={<div style={{ padding: 32, textAlign: "center" }}>No pixels found</div>}
          >
            {filtered.map((p, i) => (
              <IndexTable.Row id={p.id} key={p.id} position={i}>
                <IndexTable.Cell>
                  <Checkbox label="Active" labelHidden checked={p.active}
                    onChange={(v) => submit({ _action: "toggleActive", id: p.id, value: String(v) })} />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <Text as="span" tone="subdued"><code>{p.pixelId}</code></Text>
                </IndexTable.Cell>
                <IndexTable.Cell><Text as="span" fontWeight="medium">{p.name}</Text></IndexTable.Cell>
                <IndexTable.Cell>
                  <Checkbox label="CAPI" labelHidden checked={p.capiEnabled}
                    onChange={(v) => submit({ _action: "toggleCapi", id: p.id, value: String(v) })} />
                </IndexTable.Cell>
                <IndexTable.Cell>
                  <InlineStack gap="200">
                    <PolarisLink url={`/app/pixels/${p.id}`}>Edit</PolarisLink>
                    <Button variant="plain" tone="critical" onClick={() => setDeleteId(p.id)}>Delete</Button>
                  </InlineStack>
                </IndexTable.Cell>
              </IndexTable.Row>
            ))}
          </IndexTable>
        </Card>

        <Modal
          open={deleteId !== null}
          onClose={() => setDeleteId(null)}
          title="Delete pixel?"
          primaryAction={{
            content: "Delete pixel", destructive: true,
            onAction: () => { if (deleteId) submit({ _action: "delete", id: deleteId }); setDeleteId(null); },
          }}
          secondaryActions={[{ content: "Cancel", onAction: () => setDeleteId(null) }]}
        >
          <Modal.Section>
            <Text as="p">This pixel will be permanently removed and tracking will stop immediately. This action cannot be undone.</Text>
          </Modal.Section>
        </Modal>

        {toast && <Toast content={toast} onDismiss={() => setToast(null)} />}
      </Page>
    </Frame>
  );
}
```

- [ ] **Step 2: Run the app and verify the list renders**

Run: `shopify app dev` (user opens the embedded app on a dev store)
Expected: the list screen renders with the search field, "Add pixel" button, and (initially) the "No pixels found" empty state.

- [ ] **Step 3: Commit**

```bash
git add app/routes/app._index.tsx
git commit -m "feat: pixel list screen with active/CAPI toggles and delete"
```

---

### Task 11: Add pixel screen

**Files:**
- Create: `app/routes/app.pixels.new.tsx`
- Create: `app/components/PixelForm.tsx` (shared by new + edit)

**Interfaces:**
- Consumes: `createPixel` from `app/models/pixel.server.ts`.
- Produces: `PixelForm` component (props: `mode: "new" | "edit"`, `initial?: PixelView`, `error?: string`) used by Task 12; `new` route action that creates then redirects to `/app`.

- [ ] **Step 1: Write the shared form component**

```tsx
// app/components/PixelForm.tsx
import { Form } from "@remix-run/react";
import {
  Card, BlockStack, FormLayout, TextField, Checkbox, Banner,
  Text, InlineStack, Button, Box,
} from "@shopify/polaris";
import { useState } from "react";
import type { PixelView } from "../models/pixel.server";

export function PixelForm({ mode, initial, error }:
  { mode: "new" | "edit"; initial?: PixelView; error?: string }) {
  const [name, setName] = useState(initial?.name ?? "");
  const [pixelId, setPixelId] = useState(initial?.pixelId ?? "");
  const [capiEnabled, setCapiEnabled] = useState(initial?.capiEnabled ?? false);
  const [accessToken, setAccessToken] = useState("");
  const [testEventCode, setTestEventCode] = useState(initial?.testEventCode ?? "");

  return (
    <Form method="post">
      <BlockStack gap="400">
        {error && <Banner tone="critical">{error}</Banner>}
        <Card>
          <FormLayout>
            <TextField label="Pixel name" name="name" value={name} onChange={setName}
              maxLength={255} showCharacterCount autoComplete="off" requiredIndicator />
            <TextField label="Pixel ID" name="pixelId" value={pixelId} onChange={setPixelId}
              maxLength={20} showCharacterCount autoComplete="off" requiredIndicator
              disabled={mode === "edit"} helpText={mode === "edit" ? "Pixel ID cannot be changed." : undefined} />
          </FormLayout>
        </Card>

        <Card>
          <BlockStack gap="300">
            <InlineStack align="space-between" blockAlign="center">
              <BlockStack gap="100">
                <Text as="h3" variant="headingsm">Conversions API (solution for iOS 14.5)</Text>
                <Text as="p" tone="subdued" variant="bodySm">
                  Enable server-side API to track customer events bypassing browser limitations and ad-blockers.
                </Text>
              </BlockStack>
              <Checkbox label="Enable CAPI" labelHidden checked={capiEnabled} onChange={setCapiEnabled} />
            </InlineStack>
            {capiEnabled && (
              <FormLayout>
                <TextField label="Facebook access token" name="accessToken" type="password"
                  value={accessToken} onChange={setAccessToken} autoComplete="off"
                  placeholder={initial?.hasAccessToken ? "•••••••• (leave blank to keep)" : "Enter your access token"}
                  helpText="Requires a System User Token with ads_management and ads_read." />
                <TextField label="Test event code" name="testEventCode" value={testEventCode}
                  onChange={setTestEventCode} maxLength={20} showCharacterCount autoComplete="off" />
                <Banner tone="warning">Use the test event code only while testing. Remove it afterward.</Banner>
              </FormLayout>
            )}
            <input type="hidden" name="capiEnabled" value={String(capiEnabled)} />
          </BlockStack>
        </Card>

        <Box>
          <InlineStack align="end" gap="200">
            <Button url="/app">Discard</Button>
            <Button submit variant="primary">Save pixel</Button>
          </InlineStack>
        </Box>
      </BlockStack>
    </Form>
  );
}
```

- [ ] **Step 2: Write the `new` route**

```tsx
// app/routes/app.pixels.new.tsx
import { json, redirect, type ActionFunctionArgs } from "@remix-run/node";
import { useActionData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { createPixel } from "../models/pixel.server";
import { PixelForm } from "../components/PixelForm";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
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
```

- [ ] **Step 3: Verify create works**

Run: `shopify app dev` → "Add pixel" → fill name + Pixel ID → Save.
Expected: redirects to the list; the new pixel appears. Confirm the row in MySQL Workbench shows an **encrypted** `accessToken` (not plaintext) when CAPI was enabled.

- [ ] **Step 4: Commit**

```bash
git add app/components/PixelForm.tsx app/routes/app.pixels.new.tsx
git commit -m "feat: add pixel screen with shared PixelForm"
```

---

### Task 12: Edit pixel screen (Pixel ID immutable)

**Files:**
- Create: `app/routes/app.pixels.$id.tsx`

**Interfaces:**
- Consumes: `getPixel`, `updatePixel` from `app/models/pixel.server.ts`; `PixelForm` from Task 11.
- Produces: edit route — loads a pixel, renders `PixelForm` in `edit` mode, updates on POST. Pixel ID field is disabled and never written.

- [ ] **Step 1: Write the route**

```tsx
// app/routes/app.pixels.$id.tsx
import { json, redirect, type LoaderFunctionArgs, type ActionFunctionArgs } from "@remix-run/node";
import { useLoaderData, useActionData } from "@remix-run/react";
import { Page } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getPixel, updatePixel } from "../models/pixel.server";
import { PixelForm } from "../components/PixelForm";

export const loader = async ({ request, params }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const pixel = await getPixel(session.shop, params.id!);
  if (!pixel) throw new Response("Not found", { status: 404 });
  return json({ pixel });
};

export const action = async ({ request, params }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const f = await request.formData();
  try {
    await updatePixel(session.shop, params.id!, {
      name: String(f.get("name") ?? ""),
      capiEnabled: f.get("capiEnabled") === "true",
      accessToken: (f.get("accessToken") as string) || undefined,
      testEventCode: (f.get("testEventCode") as string) || null,
    });
    return redirect("/app");
  } catch (e: any) {
    return json({ error: e.message }, { status: 400 });
  }
};

export default function EditPixel() {
  const { pixel } = useLoaderData<typeof loader>();
  const data = useActionData<typeof action>();
  return (
    <Page title="Edit Facebook pixel" backAction={{ url: "/app" }}>
      <PixelForm mode="edit" initial={pixel} error={data?.error} />
    </Page>
  );
}
```

- [ ] **Step 2: Verify edit works and Pixel ID is locked**

Run: `shopify app dev` → click Edit on a pixel.
Expected: Pixel ID field is disabled; changing name/tracking/CAPI and saving updates the row. Leaving the token blank keeps the existing token.

- [ ] **Step 3: Commit**

```bash
git add app/routes/app.pixels.$id.tsx
git commit -m "feat: edit pixel screen with immutable Pixel ID"
```

---

## Phase 4 — Tracking (webhook + Web Pixel Extension)

### Task 13: Purchase CAPI event via orders/create webhook

**Files:**
- Create: `app/routes/webhooks.orders.create.tsx`
- Modify: `shopify.app.toml` (register the `orders/create` webhook + `read_orders` scope)

**Interfaces:**
- Consumes: `listPixels`, `getDecryptedToken` from `app/models/pixel.server.ts`; `buildEvent`, `sendEvents` from `app/lib/capi.server.ts`; `authenticate.webhook`.
- Produces: a webhook handler that, for each active CAPI-enabled pixel of the shop, sends a `Purchase` event.

- [ ] **Step 1: Register the webhook and scope in `shopify.app.toml`**

```toml
[access_scopes]
scopes = "write_products,read_orders"

[webhooks]
api_version = "2024-10"

  [[webhooks.subscriptions]]
  topics = [ "orders/create" ]
  uri = "/webhooks/orders/create"
```

- [ ] **Step 2: Write the webhook route**

```tsx
// app/routes/webhooks.orders.create.tsx
import type { ActionFunctionArgs } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import { listPixels, getDecryptedToken } from "../models/pixel.server";
import { buildEvent, sendEvents } from "../lib/capi.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  const order: any = payload;

  const pixels = (await listPixels(shop)).filter((p) => p.active && p.capiEnabled);
  const eventTime = Math.floor(Date.parse(order.created_at ?? "") / 1000) || Math.floor(Date.now() / 1000);

  await Promise.all(
    pixels.map(async (p) => {
      const token = await getDecryptedToken(shop, p.id);
      if (!token) return;
      const event = buildEvent({
        eventName: "Purchase",
        eventTime,
        eventId: `order-${order.id}`, // shared with browser pixel for dedup
        email: order.email ?? undefined,
        phone: order.phone ?? undefined,
        currency: order.currency,
        value: Number(order.total_price),
      });
      const res = await sendEvents(p.pixelId, token, [event], p.testEventCode);
      if (!res.ok) console.error("CAPI send failed", p.pixelId, res.status, res.body);
    }),
  );

  return new Response();
};
```

- [ ] **Step 3: Verify the webhook fires**

Run: `shopify app dev`, then trigger a test order (or `shopify webhook trigger --topic=orders/create`).
Expected: handler runs; with a real pixel + token + test event code, the event appears in Facebook Events Manager "Test events". Without credentials it logs and returns 200.

- [ ] **Step 4: Commit**

```bash
git add app/routes/webhooks.orders.create.tsx shopify.app.toml
git commit -m "feat: send Purchase CAPI event on orders/create webhook"
```

---

### Task 14: Web Pixel Extension (browser events + dedup)

**Files:**
- Create: `extensions/web-pixel-fb/shopify.extension.toml`
- Create: `extensions/web-pixel-fb/src/index.js`

**Interfaces:**
- Consumes: Shopify Web Pixel `analytics`/`browser` APIs + extension `settings` (the active pixel IDs).
- Produces: browser-side `fbq` events with `eventID` matching the server's `event_id` (`order-<id>` for Purchase) for dedup.

- [ ] **Step 1: Create the extension config**

```toml
# extensions/web-pixel-fb/shopify.extension.toml
api_version = "2024-10"

[[extensions]]
name = "Facebook Web Pixel"
type = "web_pixel_extension"
handle = "web-pixel-fb"

  [extensions.settings]
  type = "object"

    [extensions.settings.fields.pixelIds]
    name = "pixelIds"
    description = "Comma-separated active Facebook Pixel IDs"
    type = "single_line_text_field"
```

- [ ] **Step 2: Write the pixel subscriber**

```js
// extensions/web-pixel-fb/src/index.js
import { register } from "@shopify/web-pixels-extension";

register(({ analytics, settings, init }) => {
  const ids = String(settings.pixelIds || "").split(",").map((s) => s.trim()).filter(Boolean);
  if (!ids.length) return;

  // Bootstrap fbq
  /* eslint-disable */
  !(function (f, b, e, v, n, t, s) {
    if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); };
    if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0"; n.queue = [];
    t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
  })(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
  /* eslint-enable */

  ids.forEach((id) => window.fbq("init", id));

  analytics.subscribe("page_viewed", () => window.fbq("track", "PageView"));
  analytics.subscribe("product_viewed", () => window.fbq("track", "ViewContent"));
  analytics.subscribe("product_added_to_cart", () => window.fbq("track", "AddToCart"));
  analytics.subscribe("checkout_started", () => window.fbq("track", "InitiateCheckout"));
  analytics.subscribe("checkout_completed", (event) => {
    const orderId = event?.data?.checkout?.order?.id;
    const price = event?.data?.checkout?.totalPrice;
    window.fbq("track", "Purchase", {
      currency: price?.currencyCode,
      value: price?.amount,
    }, { eventID: orderId ? `order-${orderId}` : undefined }); // dedup with server CAPI
  });
});
```

- [ ] **Step 3: Verify the extension builds and loads**

Run: `shopify app dev` and add the web pixel to the dev store; browse the storefront.
Expected: in the browser network tab, requests to `facebook.com/tr` fire on page view / add to cart / checkout. Purchase carries an `eventID` of `order-<id>`.

- [ ] **Step 4: Commit**

```bash
git add extensions/web-pixel-fb
git commit -m "feat: add Web Pixel Extension with server CAPI dedup"
```

---

## Self-Review

**Spec coverage:**
- CRUD pixels → Tasks 8, 10, 11, 12. ✓
- Enable CAPI + encrypted token → Tasks 7, 8, 11/12. ✓
- Page-level tracking selection → **dropped from scope** (spec §8); no enum, column, or UI. Every active pixel tracks all pages.
- Toggle active/inactive → Tasks 8, 10. ✓
- Web Pixel Extension + server CAPI + dedup → Tasks 9, 13, 14. ✓
- `.claude` tooling (CLAUDE.md, settings.json hooks, 6 commands, 2 skills) → Tasks 1–4. ✓
- Scaffold via Shopify CLI → Task 5. ✓
- MySQL via Prisma → Task 6. ✓
- UI per mockup → Tasks 10–12 (Polaris). ✓

**Placeholder scan:** No TBD/TODO; every code step has full code. The only deferred item (SELECTED/EXCLUDED page picker) is an explicit spec Open Item, persisted as `[]`, not a hidden placeholder.

**Type consistency:** `PixelView`/`PixelInput` defined in Task 8 are used consistently in Tasks 10–13. `buildEvent`/`sendEvents` signatures (Task 9) match their callers (Task 13). `event_id`/`eventID` dedup key is `order-<id>` in both Task 13 (server) and Task 14 (browser). ✓

> **Note on TDD coverage:** Phases 0–2 are unit-tested (crypto, model, CAPI). Phase 3–4 (Remix UI, webhook, extension) are verified by running the app against a dev store rather than unit tests, since they depend on Shopify runtime/auth. The `/verify` flow captures this evidence in `docs/flow/verification.md`.
