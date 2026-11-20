# Draft / Publish (CMS Pages) — design v1

Status: **D2 as built** — admin drafts API on live `content_drafts`; no UI; publishing still `POST /api/site-content`.

## Problem

CMS Pages saves go live immediately. There is no side-channel draft: every successful POST to site content updates the live `site_content` rows the public site reads.

## Existing facts

| Concern | Where | Note |
|---------|-------|------|
| Stale-write guard | `pages/api/site-content.ts:225-260` | POST locks submitted keys, compares `base_hash`; mismatch → **409** `{ error: "stale", conflicts }` |
| Public read | `pages/api/site-content.ts:106-109` | Anonymous GET uses cached public map + filter; admin path uncached |
| Preview channel | `lib/cmsPreview.ts:6`, `:126-138` | Client-only preview messages; `buildDirtyOverrides` diffs current vs saved |
| SSR-only keys | `lib/cmsPreview.ts:11-33` | Hero/SEO keys stay SSR-fed; not live from the preview provider map |
| Revisions | `content_revisions` + migrate script | Append-only history; InnoDB utf8mb4; no FK |
| RBAC | `lib/adminPermissions.ts:83-112` | Manager has `content.manage`; writer does not — reuse existing roles |

## Table: `content_drafts`

One **shared draft per page** (unique on `entity_type` + `entity_id`). Phase 1 entity: `site_content_page` with `entity_id` = `page_name`.

`draft_json` holds **changed keys only**: `{ key: { value, base_hash } }` — no secrets. `draft_version` starts at 1 and bumps on each draft save for optimistic concurrency.

Schema (exact owner SQL lives in `scripts/migrate-content-drafts.js`; CHECK-ONLY, no apply mode):

- PK `id`; UNIQUE `uq_cd_entity (entity_type, entity_id)`; KEY `idx_cd_updated (updated_at)`
- InnoDB, `utf8mb4_unicode_ci`; `entity_type` `ascii_bin`; no FOREIGN KEY

## D2 API (not in this task)

- `pages/api/admin-drafts.ts` + `lib/contentDrafts.ts`
- Capability probe patterned on `lib/leadsHandledCapability.ts`: **inert when the table is missing**
- Draft save carries `expected_draft_version`; mismatch → **409**

## Publish path

Publish = existing `POST /api/site-content` with the stored `base_hash` values from the draft, then **DELETE** the draft row. A leftover draft after a concurrent live edit is caught by the site-content **409** stale guard (and/or draft version 409).

## D3 UI (not in this task)

New `components/admin/CmsDraftBar.tsx`: Save draft / Publish / Discard, banner, preview fed from the draft. The normal live Save control stays.

## Public/SEO impact: none

Public reads, sitemap, head/metadata/JSON-LD, consent/CSP are untouched in D1–D3 as designed. Drafts are admin-only storage.

## Phases

| Phase | Scope |
|-------|--------|
| **D1** (this task) | Check-only migrate script + design doc; owner DDL prep; zero runtime |
| **D2** | Admin drafts API + capability probe; inert without table |
| **D3** | CmsDraftBar UI + preview-from-draft |
| **D4** | Harden edge cases (concurrent publish, discard, age warning) |
| **D5** | Optional follow-ups after live soak |

## Out of scope

- Scheduled publish (unattended publish rule)
- Approval workflow
- Auto-expiry / auto-delete of old drafts

## D2 as built

Admin-only drafts API on the live `content_drafts` table. **No UI. Never writes `site_content`.** Publish remains existing `POST /api/site-content` (D3 will call it later).

| Item | Detail |
|------|--------|
| Endpoint | `pages/api/admin-drafts.ts` — `GET` / `PUT` / `DELETE` |
| Auth | `requireAdminPermission(..., "content.manage", { mutate: method !== "GET" })` |
| Cache | `Cache-Control: no-store` |
| Capability | Probe `SELECT id FROM content_drafts LIMIT 0`; missing table → inert (`available:false` / `503 drafts_unavailable`) |
| Entity (phase 1) | `entity_type=site_content_page`, `entity_id` = page name `/^[a-z0-9_-]{1,50}$/` |
| GET single | `?entity_type&entity_id` → `{ available, draft }` |
| GET list | `?entity_type` only → `{ available, drafts }` (no `changes`, max 100, `updated_at DESC`) |
| PUT create | `expected_draft_version: null` → INSERT v1; duplicate → `409 draft_exists` |
| PUT update | number + `SELECT … FOR UPDATE`; mismatch → `409 draft_stale`; missing → `409 draft_missing` |
| DELETE | body requires `expected_draft_version`; missing → `404 draft_missing`; stale → `409` |
| Validation codes | `invalid_entity`, `empty_draft`, `too_many_keys` (≤200), `invalid_key`, `settings_key_not_allowed`, `secret_key_not_allowed`, `unknown_key`, `invalid_value`, `invalid_base_hash`, `draft_too_large` (≤1 MB) |
| Audit | `content_draft.save` / `content_draft.discard`; metadata `{ keys, draft_version }` — never values |
| Helpers | `lib/contentDrafts.ts`, `lib/contentDraftsCapability.ts` |

## Owner decisions (recorded 19 Nov 2026)

All six = **Yes**:

1. Pages only first
2. One shared draft per page
3. No new roles
4. No scheduled publish
5. Table approved
6. No auto-delete; show an "N days old" warning

## D3 as built

Admin-only Content Editor draft bar on `/sidhu` → Content Editor. **Zero public change.** Normal live Save buttons unchanged. Publish goes through existing `saveContent()` → `POST /api/site-content` (base_hash + Reload/Overwrite/Cancel stale dialog), then `DELETE` the draft.

| Item | Detail |
|------|--------|
| UI | `components/admin/CmsDraftBar.tsx` (`"use client"`) — Save draft / Open draft / Publish draft / Discard draft |
| Helpers | `lib/contentDraftClient.ts` — pure, client-safe (`buildDraftChanges`, `liveChangedKeys`, `draftOverrides`, `keysMatchingLive`, `formatDraftBanner`) |
| Wiring | `app/sidhu/page.tsx` — one import + one `<CmsDraftBar …/>` directly after `<CmsPreviewPane …/>`; `saveContent` byte-identical |
| Overview | Compact “Pages with unpublished drafts” list when drafts exist (`GET ?entity_type=site_content_page`) |
| Page bar | Banner “Draft by {who}, saved {when} — N change(s) — NOT live”; ⚠ when `age_days >= 7` |
| Auth | `credentials:"include"`; `401` → session expired; `403` / `available:false` → render nothing |
| Concurrency | PUT/DELETE send `expected_draft_version`; `409 draft_stale`/`draft_exists` → toast + reload |
| No auto-save | No timers, no polling, no new `localStorage` keys |
| D2 nits | (N1) structure/`too_many_keys` before `loadKnownKeys`; (N2) bad version → `400 invalid_version` |

## D4 as built

Admin-only **product** drafts on the existing `content_drafts` table (entity_type=`product`). **Zero public change. No new table / schema.** Live product data changes only when the normal Update (PUT `/api/admin-products`) succeeds; the draft row is deleted best-effort in the same TX right before commit.

| Item | Detail |
|------|--------|
| Entity | `entity_type=product`, `entity_id` = product id `/^[1-9][0-9]{0,9}$/` |
| Draft JSON | `{ fields: {…13 EditProductDraft keys, all optional strings}, base_version: integer >= 0 }` |
| Validation | `validateProductDraft` — `unknown_field` / `invalid_value` / `invalid_base_version` / `draft_too_large` (≤1 MB) |
| Permission | `products.manage` for product drafts; `content.manage` unchanged for `site_content_page` |
| PUT missing product | `404 product_missing` |
| UI | `components/admin/ProductDraftBar.tsx` — Save draft / Open draft / Discard draft; publish via Update |
| Helpers | `lib/productDraftClient.ts` — pure client helpers + `formatDraftBanner` reuse |
| Publish | Optional `publish_draft: { expected_draft_version }` on product PUT; DELETE draft on same conn before commit (noop + update); errors ignored → `draft_published:false` |
| Audit | Field **names** only (never values); product update audit may include `draft_published` |
| Site pages | `site_content_page` validators / DTO / API behaviour unchanged |
