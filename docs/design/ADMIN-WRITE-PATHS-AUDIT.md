# Admin write-path audit (F4UK-MULTI-123)

Scope: every mutating admin/write handler under `pages/api/**` (`app/api/**` empty). Excludes frozen `/erp`. Pure public reads omitted. Coupon `action=validate` omitted (no durable admin write). Non-mutating AI POSTs (`admin-seo-ai`, `admin-blog-research`) omitted.

Hardened releases marked in notes: **108 / 109 / 111 / 113 / 114 / 122 / 123 / 124**.

| endpoint | method/action | permission | input validation (Y/partial/N) | transaction (Y/N) | row lock FOR UPDATE (Y/N) | stale guard (Y/N/NA) | revision (Y/N) | audit (Y/N) | cache invalidation (Y/N/NA) | risk (H/M/L) + one-line note |
|---|---|---|---|---|---|---|---|---|---|---|
| `/api/admin-login` | POST | public (auth) | Y | N | N | NA | N | Y | NA | **L** — rate-limited login; session + audit |
| `/api/admin-logout` | POST | same-origin session | Y | N | N | NA | N | Y | NA | **L** — destroys session cookie/token |
| `/api/admin-profile` | POST password change | authenticated admin | Y | N | N | NA | N | Y | NA | **M** — password update + session revoke not atomic |
| `/api/admin-staff` | POST create | `staff.manage` | Y | N | N | NA | N | Y | NA | **L** — validated insert + dup 409 |
| `/api/admin-staff` | PUT update | `staff.manage` | Y | N | N | N | N | Y | NA | **M** — last-super-admin / self-disable checks without row lock |
| `/api/admin-staff` | DELETE | `staff.manage` | Y | N | N | NA | N | Y | NA | **M** — session destroy then delete not transactional |
| `/api/admin-staff-password` | POST reset | `staff.manage` | Y | N | N | NA | N | Y | NA | **L** — reset + session revoke; no FOR UPDATE |
| `/api/site-content` | POST upsert (single/batch) | `content.manage` / `settings.manage` | partial | Y | Y | Y | Y | Y | Y | **L** — hardened MULTI-108/109 (stale `base_hash` + FOR UPDATE; legacy omit allowed) |
| `/api/site-content` | PUT upsert by `content_key` | `content.manage` / `settings.manage` | partial | Y | Y | Y | Y | Y | Y | **L** — hardened MULTI-124 (FOR UPDATE + optional `base_hash`; legacy omit allowed; returns `base_hash`) |
| `/api/site-content` | DELETE by key | `content.manage` / `settings.manage` | partial | Y | N | NA | Y | Y | Y | **M** — revision+delete tx without FOR UPDATE (TOCTOU snapshot) |
| `/api/sections` | POST update section JSON | `page_builder.manage` | partial | Y | Y | Y | Y | Y | Y | **L** — hardened MULTI-111 |
| `/api/sections` | PUT `?action=visibility` | `page_builder.manage` | Y | Y | Y | N | Y | Y | Y | **L** — hardened MULTI-122 (atomic+lock; no visibility stale token) |
| `/api/sections` | PUT `?action=reorder` | `page_builder.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — hardened MULTI-122 (`base_orders`) |
| `/api/blog` | POST create | `blog.manage` | Y | N | N | NA | N | Y | Y | **L** — insert + audit + sitemap; slug race → DB error |
| `/api/blog` | PUT update | `blog.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — hardened MULTI-113 |
| `/api/blog` | DELETE | `blog.manage` | partial | Y | N | NA | Y | Y | Y | **M** — tx+revision without FOR UPDATE; weak `id` validation |
| `/api/faqs` | POST create | `faqs.manage` | partial | N | N | NA | N | Y | NA | **L** — simple insert; no public FAQ cache layer |
| `/api/faqs` | POST `action=reorder` | `faqs.manage` | Y | Y | Y | N | N | Y | NA | **M** — full-table lock+tx but no `base_orders`-style stale |
| `/api/faqs` | PUT update | `faqs.manage` | partial | Y | Y | Y | N | Y | NA | **L** — hardened MULTI-114 |
| `/api/faqs` | DELETE | `faqs.manage` | Y | Y | Y | NA | N | Y | NA | **L** — hardened MULTI-123 |
| `/api/admin-orders` | PATCH status | `orders.manage` | Y | N | N | N | N | Y | NA | **H** — status/cancel_reason race; non-atomic ENUM restore path |
| `/api/admin-orders` | DELETE | `orders.manage` | Y | Y | Y | NA | N | Y | NA | **L** — hardened MULTI-123 |
| `/api/coupons` | POST create | `coupons.manage` | Y | N | N | NA | N | Y | NA | **L** — validated insert; dup → 409 |
| `/api/coupons` | PUT update | `coupons.manage` | Y | N | N | N | N | Y | NA | **M** — hardened MULTI-123 (dup 409); still no lock/stale |
| `/api/coupons` | DELETE | `coupons.manage` | Y | N | N | NA | N | Y | NA | **L** — select-then-delete without lock |
| `/api/admin-products` | POST create | `products.manage` | Y | N | N | NA | N | Y | Y | **L** — validated create + sitemap |
| `/api/admin-products` | PUT content update | `products.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — FOR UPDATE + `expected_version` |
| `/api/admin-products` | PATCH visibility | `products.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — locked visibility writer |
| `/api/admin-products` | PATCH season/lifecycle | `products.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — locked season writer + version gate |
| `/api/admin-products` | DELETE | `products.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — locked delete + version gate |
| `/api/admin-product-url-migration` | POST migrate slug | `products.manage` + `redirects.manage` | Y | Y | Y | Y | Y | Y | Y | **L** — controlled migration under product lock |
| `/api/admin/leads` | PATCH/PUT handled | `leads.manage` | Y | N | N | N | N | Y | NA | **M** — handled flip without lock |
| `/api/admin/leads` | DELETE single/bulk | `leads.manage` | partial | N | N | NA | N | Y | NA | **M** — bulk delete unlocked; no affected-row confirmation |
| `/api/admin-reviews` | PATCH approve/reject | `reviews.manage` | Y | N | N | N | N | Y | Y | **M** — moderation race without FOR UPDATE |
| `/api/admin-reviews` | PATCH edit | `reviews.manage` | Y | N | N | N | N | Y | Y | **M** — edit without lock/stale |
| `/api/admin-reviews` | DELETE | `reviews.manage` | Y | N | N | NA | N | Y | Y | **L** — select-then-delete |
| `/api/reviews` | POST submit | public (same-origin) | Y | N | N | NA | N | N | Y | **L** — validated public pending insert |
| `/api/admin-redirects` | POST create | `redirects.manage` | Y | N | N | NA | N | Y | NA | **M** — graph validation not under lock |
| `/api/admin-redirects` | PUT update | `redirects.manage` | Y | N | N | N | N | Y | NA | **M** — concurrent source/graph races |
| `/api/admin-redirects` | DELETE | `redirects.manage` | Y | N | N | NA | N | Y | NA | **M** — unlocked delete |
| `/api/admin-revisions/restore` | POST restore | `revisions.view` + entity restore ACL | Y | Y | Y | partial | Y | Y | Y | **L** — hardened MULTI-124 (blog/section/site_content FOR UPDATE; product unchanged FOR UPDATE+version; restore = intentional overwrite, no new stale guard) |
| `/api/upload` | POST media | admin + purpose ACL | Y | N | N | NA | N | Y | NA | **L** — validated image upload + media audit |
| `/api/upload-favicon` | POST | `settings.manage` | Y | Y | Y | NA | Y | Y | Y | **L** — hardened MULTI-124 (TX + FOR UPDATE + revision when `favicon_url` changes; file/Cloudinary path unchanged) |
| `/api/upload-receipt` | POST | public | Y | N | N | NA | N | N | NA | **L** — hardened MULTI-108 (receipt contract; COD ignore on orders) |
| `/api/orders` | POST create order | public | Y | Y | Y | NA | N | N | NA | **L** — hardened MULTI-108 (COD receipt ignored; product+coupon FOR UPDATE) |
| `/api/contact` | POST message | public | Y | N | N | NA | N | N | NA | **L** — rate-limited insert |
| `/api/admin-insights/settings` | POST update | `insights.settings` | Y | N | N | N | N | Y | Y | **M** — multi-key upsert without single tx |
| `/api/insights-collect` | POST ingest | public (same-origin) | Y | N | N | NA | N | N | NA | **L** — gated ingest; no durable tx/locks |
| `/api/admin-seo-issues/reconcile` | POST reconcile | admin + scope ACL | Y | Y | N | NA | N | Y | NA | **M** — reconcile tx without FOR UPDATE; concurrent runs can race |
| `/api/admin-orders-export` | GET export (side-effect audit) | `orders.view` / export ACL | Y | N | N | NA | N | Y | NA | **L** — read+audit only; no row mutation |

Restore locking detail: **product** = FOR UPDATE + `expected_version`; **blog / section / site_content / site_settings** = FOR UPDATE inside the restore transaction (MULTI-124); restore remains an intentional overwrite (no stale/version guard on restore).

## Top 5 remaining risks

1. **`/api/admin-orders` PATCH** — order status / cancel_reason updates without transaction, row lock, or stale guard.
2. **`/api/site-content` DELETE** — revision+delete tx without FOR UPDATE (TOCTOU snapshot).
3. **`/api/blog` DELETE** — tx+revision without FOR UPDATE; weak `id` validation.
4. **`/api/admin/leads` DELETE (esp. bulk) and `/api/admin-redirects` mutations** — destructive / graph-changing writes without transactions or row locks.
5. **`/api/admin-staff` PUT/DELETE and `/api/admin-reviews` mutations** — concurrent staff/moderation races without FOR UPDATE.

Inventory updated MULTI-124 (PUT / restore lock / favicon revision hardened).
