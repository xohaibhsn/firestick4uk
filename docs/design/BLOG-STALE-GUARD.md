# Blog editor stale-write guard (REPORT-ONLY DESIGN)

Status: **design only** — not implemented. No runtime code in this task.

## Current save path

### API — `pages/api/blog.ts`

| Method | Behaviour |
|--------|-----------|
| **POST** | Requires explicit `status`; delegates to `createBlogPost({ actor, input: body, mode, source: "manual_cms", ip })`. |
| **PUT** | Requires `body.id`; optional status via `requireSuppliedBlogStatus`; delegates to `updateBlogPost({ actor, id, patch: body, mode, source: "manual_cms", ip })`. |
| **DELETE** | Soft revision snapshot then `DELETE FROM blog_posts WHERE id = ?`; audit + sitemap invalidate + `runPostSaveSeoGuard({ operation: "delete" })`. |

### Persistence — `lib/blogPersistenceServer.ts`

**Editable input fields (`BlogPostInput`):**  
`title`, `slug`, `excerpt`, `content`, `category`, `emoji`, `badge`, `badgeText`, `featured_image`, `meta_title`, `meta_description`, `focus_keyword`, `featured`, `canonical_url`, `faqs` (+ `status` on write).

**INSERT columns (create):**  
`title, slug, excerpt, content, category, emoji, badge, badgeText, featured_image, meta_title, meta_description, focus_keyword, status, featured, canonical_url, faqs, active` (`active=1`).

**UPDATE columns (update via `writeRevisionAndUpdate`):**  
same content fields + `status` / `featured` / `canonical_url` / `faqs` — **not** `active` / `created_at`.

**Locking today:** `SELECT * FROM blog_posts WHERE id = ? LIMIT 1 FOR UPDATE` then revision snapshot of the **pre-update** row, then UPDATE. This serialises writers on the same connection/TX but is still **last-write-wins** across overlapping admin sessions (each session loads an old editor buffer).

### Sidhu editor — `app/sidhu/page.tsx` (`saveBlog`)

1. Read `editorRef` HTML into `content`.
2. `payload = { ...editBlog, content }`.
3. POST (new) or PUT `{ ...payload, id }`.
4. On success: SEO guard banner via `formatSeoGuardBannerClient(res.seo_guard)`; refresh list.

No client base-hash / version / busy double-tab guard on blog save.

## Does `blog_posts` have `updated_at` / `version`?

| Evidence | Finding |
|----------|---------|
| `app/lib/schema.sql` CREATE | `created_at` only — **no** `updated_at` / `version` |
| `scripts/migrate-core-runtime-schema.js` `BLOG_ADD_COLUMNS` / CREATE | adds meta/status/featured/canonical/faqs/active/… — **no** `updated_at` / `version` |
| `lib/revisionCompare.ts` blog branch | returns `version: null` |
| Live DB beyond repo DDL | **UNKNOWN** (no DB access in this task) |

**Repo-provable:** no optimistic concurrency column for blog posts. Live extras: **UNKNOWN**.

## Interplay with SEO post-save guard + revisions

| Concern | Behaviour |
|---------|-----------|
| **Revisions** | Pre-update snapshot (`BLOG_SNAPSHOT_FIELDS`) in the same TX — history, not a concurrency token. |
| **SEO post-save guard** (`lib/postSaveSeoGuard.ts`) | Runs **after** successful create/update/delete/restore; advisory (`checked` / `skipped` / `unavailable`); **never throws**; reconciles SEO issue memory for SEO fields. |
| **Restore** | Blog restore has **no** `expected_version` gate (unlike products). |

Two admins can both load the same post, edit different fields, and save: later PUT overwrites earlier; revision history retains the overwritten snapshot, but the losing editor’s in-memory buffer is stale with no 409.

## Proposed guard design (mirror Page Builder / MULTI-111)

### Canonical tuple (server)

On admin GET of a single post (or list-edit hydrate), compute:

```
base_hash = sha256(canonical_json([
  title, slug, excerpt, content, category, emoji, badge, badgeText,
  featured_image, meta_title, meta_description, focus_keyword,
  status, featured, canonical_url, faqs
]))
```

- Canonicalisation: UTF-8 JSON with sorted keys, normalised newlines in `content`, stable FAQ array order.
- Return `base_hash` on **admin** GET only (never on public blog APIs).

### Write path

1. PUT/POST-update requires `base_hash` (or explicit `force: true`).
2. Inside existing `FOR UPDATE` TX: re-read row → recompute hash.
3. If mismatch and not `force` → **409** `{ error: "stale", conflicts: [...field names optional], current_base_hash }`.
4. Sidhu UX: **Reload** (fetch fresh + new hash) / **Overwrite** (`force: true`, audit `blog.overwrite_stale`) / **Cancel**.
5. Success response returns the new `base_hash`.

### Legacy path

- Clients omitting `base_hash` keep last-write-wins for one release (log `blog.save_without_base_hash`), then make `base_hash` required for `/sidhu` saves.
- DELETE unchanged (or optionally require hash of last-known snapshot).

### Risk

| Risk | Mitigation |
|------|------------|
| Hash churn from non-semantic whitespace | Normalise content before hash; same normaliser on GET + PUT. |
| Large `content` hashing cost | Acceptable for admin-only; cache hash on row only if a column is added later. |
| Force overwrite abuse | Audit + role gate (`blog.manage`). |
| Interaction with SEO guard | Unchanged: still runs after successful write; 409 never triggers SEO. |
| Revisions | Continue snapshot-before-update; force overwrite still records revision. |

### Test plan (when implemented)

1. Mocked DB: GET returns `base_hash`; PUT same hash → 200 + new hash.
2. Concurrent: two hashes; second without force → 409; with force → 200 + audit.
3. Legacy omit hash → documented behaviour for rollout window.
4. Public GET/list: no `base_hash` field.
5. SEO guard still fires on successful save; skipped on 409.
6. Sidhu: Reload restores fields; Cancel leaves editor; Overwrite confirms.

**Out of scope for MULTI-112:** implementation. This document only.
