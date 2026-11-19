# Draft / Publish (CMS Pages) — design v1

Status: **D1 check-only** — `content_drafts` migration script shipped; no runtime/API/UI use yet. Owner applies DDL separately after Berlin PASS.

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

## Owner decisions (recorded 19 Nov 2026)

All six = **Yes**:

1. Pages only first
2. One shared draft per page
3. No new roles
4. No scheduled publish
5. Table approved
6. No auto-delete; show an "N days old" warning
