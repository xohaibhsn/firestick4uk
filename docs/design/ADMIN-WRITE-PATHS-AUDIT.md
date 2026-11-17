# Admin write-path audit (F4UK-MULTI-126)

Scope: every mutating admin/write handler under `pages/api/**` (`app/api/**` empty). Excludes frozen `/erp`. Pure public reads omitted. Coupon `action=validate` omitted (no durable admin write). Non-mutating AI POSTs (`admin-seo-ai`, `admin-blog-research`) omitted.

Hardened releases marked in notes: **108 / 109 / 111 / 113 / 114 / 122 / 123 / 124 / 125 / 126**.

**Series closed at MULTI-126.** Remaining items below are ACCEPTED RISK (owner may revisit).

| endpoint | method/action | permission | input validation (Y/partial/N) | transaction (Y/N) | row lock FOR UPDATE (Y/N) | stale guard (Y/N/NA) | revision (Y/N) | audit (Y/N) | cache invalidation (Y/N/NA) | risk (H/M/L) + one-line note |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/admin-login` | POST | public (auth) | Y | N | N | NA | N | Y | NA | **L** — rate-limited login; session + audit |
| `/api/admin-logout` | POST | same-origin session | Y | N | N | NA | N | Y | NA | **L** — destroys session cookie/token |
| `/api/admin-profile` | POST password change | authenticated admin | Y | N | N | NA | N | Y | NA | **M** — ACCEPTED RISK: password update + session revoke not atomic |
| `/api/admin-staff` | POST create | `staff.manage` | Y | N | N | NA | N | Y | NA | **L** — validated insert + dup 409 |
| `/api/admin-staff` | PUT update | `staff.manage` | Y | N | N (named lock) | N | N | Y | NA | **L** — hardened MULTI-126 (`GET_LOCK f4uk_admin_staff` around read→guard→write→revoke) |
| `/api/admin-staff` | DELETE | `staff.manage` | Y | N | N (named lock) | NA | N | Y | NA | **L** — hardened MULTI-126 (named lock + affectedRows 0 → 404, no audit) |
| `/api/admin-staff-password` | POST reset | `staff.manage` | Y | N | N | NA | N | Y | NA | **L** — reset + session revoke; no FOR UPDATE |
| `/api/site-content` | POST upsert (single/batch) | `content.manage` / `settings.manage` | partial | Y | Y | Y | Y | Y | Y | **L** — hardened MULTI-108/109 (stale `base_hash` + FOR UPDATE; legacy omit allowed) |
| `/api/site-content` | PUT upsert by `content_key` | `content.manage` / `settings.manage` | partial | Y | Y | Y | Y | Y | Y | **L** — hardened MULTI-124 (FOR UPDATE + optional `base_hash`; legacy omit allowed; returns `base_hash`) |
| `/api/site-content` | DELETE by key | `content.manage` / `settings.manage` | partial | Y | Y | NA | Y | Y | Y | **L** — hardened MULTI-125 (FOR UPDATE locked revision+delete; missing key still 200+audit, no revision) |
| `/api/sections` | POST update section JSON | `page_builder.manage` | partial | Y | Y | Y | Y | Y | Y | **L** — hardened MULTI-111 |
| `/api/sections` | PUT `?action=visibility` | `page_builder.manage` | Y | Y | Y | N | Y | Y | Y | **L** — hardened MULTI-122 (atomic+lock; no visibility stale token) |
| `/api/sections` | PUT `?action=reorder` | `page_builder.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — hardened MULTI-122 (`base_orders`) |
| `/api/blog` | POST create | `blog.manage` | Y | N | N | NA | N | Y | Y | **L** — insert + audit + sitemap; slug race → DB error |
| `/api/blog` | PUT update | `blog.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — hardened MULTI-113 |
| `/api/blog` | DELETE | `blog.manage` | Y | Y | Y | NA | Y | Y | Y | **L** — hardened MULTI-125 (positive int id; FOR UPDATE; missing → 404, no blind delete/audit/sitemap/SEO) |
| `/api/faqs` | POST create | `faqs.manage` | partial | N | N | NA | N | Y | NA | **L** — simple insert; no public FAQ cache layer |
| `/api/faqs` | POST `action=reorder` | `faqs.manage` | Y | Y | Y | N | N | Y | NA | **M** — ACCEPTED RISK: full-table lock+tx but no `base_orders`-style stale token |
| `/api/faqs` | PUT update | `faqs.manage` | partial | Y | Y | Y | N | Y | NA | **L** — hardened MULTI-114 |
| `/api/faqs` | DELETE | `faqs.manage` | Y | Y | Y | NA | N | Y | NA | **L** — hardened MULTI-123 |
| `/api/admin-orders` | PATCH status | `orders.manage` | Y | Y | Y | Y | N | Y | NA | **L** — hardened MULTI-125 (FOR UPDATE + optional `base_status` stale 409; ENUM mismatch → rollback, no compensating UPDATE) |
| `/api/admin-orders` | DELETE | `orders.manage` | Y | Y | Y | NA | N | Y | NA | **L** — hardened MULTI-123 |
| `/api/coupons` | POST create | `coupons.manage` | Y | N | N | NA | N | Y | NA | **L** — validated insert; dup → 409 |
| `/api/coupons` | PUT update | `coupons.manage` | Y | N | N | N | N | Y | NA | **M** — ACCEPTED RISK: no stale guard (dup 409 only; MULTI-123) |
| `/api/coupons` | DELETE | `coupons.manage` | Y | N | N | NA | N | Y | NA | **L** — hardened MULTI-126 (affectedRows 0 → 404, no audit; prev SELECT kept for code text) |
| `/api/admin-products` | POST create | `products.manage` | Y | N | N | NA | N | Y | Y | **L** — validated create + sitemap |
| `/api/admin-products` | PUT content update | `products.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — FOR UPDATE + `expected_version` |
| `/api/admin-products` | PATCH visibility | `products.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — locked visibility writer |
| `/api/admin-products` | PATCH season/lifecycle | `products.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — locked season writer + version gate |
| `/api/admin-products` | DELETE | `products.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — locked delete + version gate |
| `/api/admin-product-url-migration` | POST migrate slug | `products.manage` + `redirects.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — controlled migration under product lock |
| `/api/admin/leads` | PATCH/PUT handled | `leads.manage` | Y | N | N | N | N | Y | NA | **M** — handled flip without lock |
| `/api/admin/leads` | DELETE single/bulk | `leads.manage` | Y | N | N | NA | N | Y | NA | **L** — hardened MULTI-126 (bulk ≤500 + no silent drop; deleted/audit = affectedRows; single 0 → 404) |
| `/api/admin-reviews` | PATCH approve/reject | `reviews.manage` | Y | N | N | N | N | Y | Y | **M** — ACCEPTED RISK: moderation races without FOR UPDATE |
| `/api/admin-reviews` | PATCH edit | `reviews.manage` | Y | N | N | N | N | Y | Y | **M** — ACCEPTED RISK: edit without lock/stale |
| `/api/admin-reviews` | DELETE | `reviews.manage` | Y | N | N | NA | N | Y | Y | **M** — ACCEPTED RISK: select-then-delete moderation race |
| `/api/reviews` | POST submit | public (same-origin) | Y | N | N | NA | N | N | Y | **L** — validated public pending insert |
| `/api/admin-redirects` | POST create | `redirects.manage` | Y | N | N (named lock) | NA | N | Y | NA | **L** — hardened MULTI-126 (`GET_LOCK f4uk_redirects` around validate+write+audit) |
| `/api/admin-redirects` | PUT update | `redirects.manage` | Y | N | N (named lock) | N | N | Y | NA | **L** — hardened MULTI-126 (named lock serializes graph validation + write) |
| `/api/admin-redirects` | DELETE | `redirects.manage` | Y | N | N (named lock) | NA | N | Y | NA | **L** — hardened MULTI-126 (named lock around delete+audit) |
| `/api/admin-revisions/restore` | POST restore | `revisions.view` + entity restore ACL | Y | Y | Y | partial | Y | Y | Y | **L** — hardened MULTI-124 (blog/section/site_content FOR UPDATE; product unchanged FOR UPDATE+version; restore = intentional overwrite, no new stale guard) |
| `/api/upload` | POST media | admin + purpose ACL | Y | N | N | NA | N | Y | NA | **L** — validated image upload + media audit |
| `/api/upload-favicon` | POST | `settings.manage` | Y | Y | Y | NA | Y | Y | Y | **L** — hardened MULTI-124 (TX + FOR UPDATE + revision when `favicon_url` changes; file/Cloudinary path unchanged) |
| `/api/upload-receipt` | POST | public | Y | N | N | NA | N | N | NA | **L** — hardened MULTI-108 (receipt contract; COD ignore on orders) |
| `/api/orders` | POST create order | public | Y | Y | Y | NA | N | N | NA | **L** — hardened MULTI-108 (COD receipt ignored; product+coupon FOR UPDATE) |
| `/api/contact` | POST message | public | Y | N | N | NA | N | N | NA | **L** — rate-limited insert |
| `/api/admin-insights/settings` | POST update | `insights.settings` | Y | N | N | N | N | Y | Y | **M** — multi-key upsert without single tx |
| `/api/insights-collect` | POST ingest | public (same-origin) | Y | N | N | NA | N | N | NA | **L** — gated ingest; no durable tx/locks |
| `/api/admin-seo-issues/reconcile` | POST reconcile | admin + scope ACL | Y | Y | N | NA | N | Y | NA | **M** — ACCEPTED RISK: reconcile tx without FOR UPDATE; concurrent runs can race |
| `/api/admin-orders-export` | GET export (side-effect audit) | `orders.view` / export ACL | Y | N | N | NA | N | Y | NA | **L** — read+audit only; no row mutation |

Restore locking detail: **product** = FOR UPDATE + `expected_version`; **blog / section / site_content / site_settings** = FOR UPDATE inside the restore transaction (MULTI-124); restore remains an intentional overwrite (no stale/version guard on restore).

## Hardened in MULTI-126 (F1–F4)

1. **F1** `/api/admin-staff` PUT/DELETE — `withNamedLock('f4uk_admin_staff')` serializes read → last-super-admin guard → write → session revoke; DELETE uses affectedRows (0 → 404, no audit).
2. **F2** `/api/admin-redirects` POST/PUT/DELETE — `withNamedLock('f4uk_redirects')` serializes validation + write + audit.
3. **F3** `/api/admin/leads` DELETE — bulk ≤500 + reject non-positive ids (`invalid_ids`); `deleted`/audit = affectedRows; single missing → 404 `not_found`, no audit.
4. **F4** `/api/coupons` DELETE — DELETE affectedRows 0 → 404, no audit (prev SELECT kept for audit code text).

## ACCEPTED RISK (owner may revisit)

- **coupons PUT** — no stale guard (dup 409 only).
- **admin-reviews PATCH/DELETE** — moderation races without FOR UPDATE.
- **faqs reorder** — no base token, but already locked + validated.
- **admin-profile password** — password update + session revoke not atomic.
- **admin-seo-issues reconcile** — reconcile tx without FOR UPDATE; concurrent runs can race.

## Series closed at MULTI-126

Write-path hardening series **108→126** is closed. Further work requires a new owner-approved series; accepted risks above are explicitly deferred.

Inventory updated MULTI-126 (staff/redirect named locks; lead/coupon delete correctness).
