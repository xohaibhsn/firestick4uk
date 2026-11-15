# Legacy suites archive (MULTI-107)

These files are **not** run by gated `scripts/phase-*-tests.js` suites.
They were triaged in MULTI-106 (`_reports/multi-106/LEGACY-SUITES.md`).

## Archived FAIL-STALE (8) — moved here in MULTI-107

Assertions target superseded code shapes; intended behaviour still exists under new paths/helpers.

| File | Why stale (superseding behaviour) |
|------|-----------------------------------|
| `phase13-cms-data-integrity-tests.js` | Sidhu products list/create/delete and nav roles moved to permission-driven tabs / optimistic reconcile (`app/sidhu/page.tsx`, `lib/adminPermissions.ts`). |
| `phase19b-content-integrity-tests.js` | Blog page split to SSR + `app/blog/BlogClient.tsx`; empty-state copy moved out of `page.tsx`. |
| `phase20a-source-fallback-consistency-tests.js` | Hardcoded Terms wording retired (`9445d74`); legal copy lives in CMS / cart / `siteContentDefaults`. |
| `phase20b-social-metadata-tests.js` | Layout favicon deliberately stable (no per-request `Date.now()` cache-bust). |
| `phase20d-product8-slug-migration-tests.js` | Sitemap helper renamed to `getSitemapDynamicDataSafe` (query intent unchanged). |
| `phase20e3-home-product-ssr-tests.js` | `HomeClient` branch order inverted (`length > 0` hydrate vs fetch); behaviour equivalent. |
| `phase20g2b-refund-meta-tests.js` | RefundPolicyClient wording updated (“14 days…”, “7-day money-back…1 Year+”). |
| `phase20g3c-digital-supply-tests.js` | Cart CSS class matches `upload-receipt` grep; product eligibility query moved to `lib/orderProductEligibility.ts`. |

## Left in `scripts/` — PASS (13)

Keep; still useful (some are partial PASS when DB/mutation sections skip).

- `phase11-favicon-security-tests.js`
- `phase17a-admin-auth-safety-tests.js`
- `phase17a1-bcrypt-config-tests.js`
- `phase18a-media-editor-integration-tests.js`
- `phase18b-media-usage-tests.js`
- `phase20e1-server-discovery-tests.js`
- `phase20e2-self-canonical-tests.js`
- `phase20e4-faq-ssr-tests.js`
- `phase20g2a-legal-cms-ssr-tests.js`
- `phase20g3b-tracking-consent-tests.js`
- `phase20g3c1-order-confirmation-tests.js`
- `phase20g3d-legal-cms-tests.js`
- `phase5-hardening-tests.js`

## Left in `scripts/` — FAIL-ENV (10)

Need a reachable disposable test DB / mutation opt-in; do not run against production `.env.local`.

- `phase10-seo-integrity-tests.js`
- `phase15b-case-normalization-tests.js`
- `phase16-product-price-validation-tests.js`
- `phase19c-safe-content-cleanup-tests.js`
- `phase19d-confirmed-business-content-tests.js`
- `phase4-audit-security-tests.js`
- `phase5-orders-security-tests.js`
- `phase7-product-update-tests.js`
- `phase8-media-security-tests.js`
- `phase9-revision-tests.js`
