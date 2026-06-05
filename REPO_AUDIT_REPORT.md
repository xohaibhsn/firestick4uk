# FIRESTICK4UK — Complete Repository Audit Report
**Date:** 5 June 2026  
**Audited by:** Claude Code CLI  
**Project:** firestick4uk.com  
**Stack:** Next.js 16.2.6 (App Router + Pages Router hybrid), MySQL (Hostinger), React 19, TypeScript, Cloudinary, TipTap  
**Scope:** Full codebase — 5 Pillars × Technical / Security / Performance / UI-UX / UX-Conversion  

> ⚠️ *No files were modified during this audit. Read-only analysis only.*

---

## 🏗️ PILLAR 1: Technical Architecture

### ✅ What's Good
- **Hybrid routing is intentional and correct** — App Router (`app/`) for pages, Pages Router (`pages/api/`) for API only. No conflicts detected.
- **Connection pooling** implemented in `lib/db.ts` with global singleton pattern — prevents max_connections_per_hour exhaustion.
- **Rate limiting** in `lib/rateLimit.ts` — covers `admin-login`, `orders`, `products`, `coupons`, `search`.
- **Cart context** (`app/lib/cartContext.tsx`) uses correct `mounted` guard before localStorage write — no hydration leak.
- **ERP session** stored in `localStorage.erp_session` and checked in `ERPLayout.tsx` on every ERP page via `useEffect`.
- **Admin session** (`sAdminSession`) checked in `app/sidhu/page.tsx` on mount; `x-admin-session` header sent on all admin API calls.
- **`xss` package** is installed in `package.json` (though not yet used — see Issues).
- **Environment variables** are in `.env.local` and `.env*` is in `.gitignore` — secrets not committed to git.
- **TypeScript** used throughout with strict compilation.
- **TipTap** loaded via `dynamic(() => import(...), { ssr: false })` — correct SSR safety.

### ❌ Issues Found

**1. DEMO DATA INITIALIZES REAL STATE (High)**  
`app/sidhu/page.tsx` lines 185–235:
```ts
const demoOrders = [{ id:"FK44-62305", customer:"John Smith"... }]
const demoProducts = [{ id:1, name:"B1G 1 Year Plan"... }]
const demoCustomers = [{ name:"John Smith", email:"john@example.com"... }]

const [orders, setOrders] = useState(demoOrders);      // starts with fake data!
const [products, setProducts] = useState(demoProducts); // starts with fake data!
const [customers, setCustomers] = useState(demoCustomers); // starts with fake data!
```
Before the `useEffect` fetch completes, the admin dashboard shows fake hardcoded orders/products/customers. Real data overwrites them only if API succeeds. If API fails, admin sees fake data silently.  
**Fix:** Initialize states as `useState([])` and show a loading spinner until fetch completes.

**2. LEFTOVER `createConnection` IN PRODUCT SLUG PAGE (Medium)**  
`app/products/[slug]/page.tsx` line 16 still uses the old direct `createConnection` pattern instead of the shared pool:
```ts
const conn = await Promise.race([
  mysql.createConnection({ host: ..., user: ..., password: 'Firestick@2026', ... }),
  new Promise(reject timeout)
])
```
This bypasses the pool singleton, creates fresh connections per SSR render, and hardcodes DB credentials inline (critical — see Security section).

**3. ADMIN PANEL IS A 1442-LINE MONOLITH (Medium)**  
`app/sidhu/page.tsx` = **1442 lines** — contains: login, dashboard, orders, products, blog editor, customers, coupons, FAQs, page builder, site settings, and more. This violates Single Responsibility Principle and makes debugging very difficult.  
**Fix:** Split into separate components per tab: `<OrdersTab />`, `<ProductsTab />`, `<BlogTab />`, etc.

**4. ERP API ROUTES HAVE NO SESSION VALIDATION (High)**  
All 9 ERP API files (`pages/api/erp/*.ts`) accept requests from anyone with a valid URL — no token, no cookie, no JWT check. Role checking exists only for expense approval (`approver_role` from request body), but the body can be spoofed.  
**Fix:** Implement server-side session validation — verify `erp_session` token against DB on every ERP API request.

**5. `app/lib/db.ts` vs `lib/db.ts` — DUPLICATE DB POOL (Medium)**  
Two separate pool files exist:
- `lib/db.ts` — used by `pages/api/` routes ✅ (correct, Pages Router)
- `app/lib/db.ts` — appears to be a misplaced or unused duplicate

The app/ folder's db.ts was likely created accidentally. Pages Router cannot import from `app/lib/`, and App Router server components should not directly pool-connect in most cases.

**6. `app/lib/schema.sql` — CHECKED IN (Low)**  
The DB schema SQL file is tracked in git. While not a secret, it exposes the full database structure publicly. Should be in a docs/ folder or `.gitignore`d.

### ⚠️ Warnings

- **89 instances of `: any` TypeScript** across the codebase — reduces type safety and IDE assistance significantly
- **104 silent catch blocks** `catch(() => {})` — errors swallowed silently, impossible to debug production issues
- **`dotenv` package** in dependencies is redundant — Next.js natively handles `.env.local`
- **`bcryptjs`** installed but only used in `admin-login.ts`. Admin password auth uses a triple-fallback (SHA-256 → bcrypt → plain). This is fragile; should standardize to bcrypt only.
- **`app/erp/my-ledger/page.tsx`** fetches `/api/erp/ledger?self=1&user_id=X&user_role=Y` — `user_role` is passed from the client. A malicious user could change `user_role=admin` to bypass the employee filter.

---

## 🔒 PILLAR 2: Cybersecurity

### ✅ What's Good
- **`.env*` in `.gitignore`** — DB password, API keys not exposed in git history (recent commits).
- **`admin-login.ts`** has rate limiting (5 attempts / 15 min via `RL_AUTH`).
- **`/admin` route** redirects to homepage — old admin URL is neutered.
- **`robots.txt`** blocks `/sidhu`, `/erp`, and `/api/` — search engines cannot index admin.
- **SQL queries use parameterized `?` placeholders** in 99% of cases — resistant to SQL injection.
- **`x-admin-session` header check** added to `admin-orders.ts` and `admin-products.ts`.
- **Expense approval** has `approver_role` check — employees cannot approve via API (if they send correct role).

### ❌ Critical Issues

**SEC-1: DB CREDENTIALS HARDCODED IN SERVER COMPONENT (Critical)**  
`app/products/[slug]/page.tsx` lines 16–20:
```ts
mysql.createConnection({
  host: process.env.DB_HOST || "srv497.hstgr.io",
  user: process.env.DB_USER || "u992747032_firestick4uk",
  password: process.env.DB_PASSWORD || "Firestick@2026",  // ← hardcoded fallback
  database: process.env.DB_NAME || "u992747032_firestick4uk",
})
```
`lib/db.ts` also has the same pattern. While env vars take priority, the hardcoded fallback means if `.env.local` is missing or variables are unset, **the real DB password appears in source code**. Source code is in a GitHub repository.  
**Fix:** Remove all hardcoded credential fallbacks — if env vars are missing, throw an error.

**SEC-2: ERP DEFAULT ADMIN PASSWORD IN PLAINTEXT (Critical)**  
`pages/api/erp/login.ts` line 22:
```ts
INSERT INTO erp_users (name,email,password,role) 
VALUES ('Admin','admin@firestick4uk.com','erp123','admin')
```
The default ERP admin password `erp123` is:
1. Stored as **plain text** in the DB (no hashing)
2. Hardcoded visibly in source code
3. Never changes unless manually updated  
**Fix:** Hash with bcrypt before storage; use a random generated password from env.

**SEC-3: ALL ERP APIS LACK SERVER-SIDE SESSION VALIDATION (Critical)**  
Any request to `GET /api/erp/employees`, `GET /api/erp/ledger`, `GET /api/erp/payroll`, etc. returns full data without validating who is calling. Role checks exist in the frontend (`ERPLayout.tsx`) but are client-side only — easily bypassed via curl or Postman.  
**Fix:** On every ERP API, read session token from headers/cookies and validate against `erp_users` table.

**SEC-4: `admin-login.ts`, `blog.ts`, `faqs.ts`, `site-content.ts`, `sections.ts`, `upload.ts`, `upload-favicon.ts` HAVE NO AUTH CHECK (High)**  
Only `admin-orders.ts` and `admin-products.ts` have `checkAdminAuth()`. The following admin-facing APIs are completely unprotected:
- `pages/api/blog.ts` — anyone can POST/PUT/DELETE blog posts
- `pages/api/faqs.ts` — anyone can add/edit/delete FAQs
- `pages/api/sections.ts` — anyone can edit homepage content
- `pages/api/site-content.ts` — anyone can change site settings, phone, email
- `pages/api/upload.ts` — anyone can upload files to Cloudinary
- `pages/api/upload-favicon.ts` — anyone can change site favicon  
**Fix:** Add `checkAdminAuth` to all admin-only API routes.

**SEC-5: UNSANITIZED BLOG CONTENT RENDERED RAW (High)**  
`app/blog/[slug]/BlogPostClient.tsx` line 148:
```tsx
<div className="post-content" dangerouslySetInnerHTML={{ __html: post.content }} />
```
TipTap generates clean HTML, but if an attacker compromises the admin account or exploits the unprotected blog API (SEC-4), they can inject arbitrary HTML/JS into the blog.  
`xss` package is installed but **never used**. DOMPurify or the `xss` package should sanitize `post.content` before rendering.

**SEC-6: CLIENT-CONTROLLED ROLE PARAM IN ERP LEDGER (High)**  
`app/erp/my-ledger/page.tsx`:
```ts
fetch(`/api/erp/ledger?self=1&user_id=${user.id}&user_role=${user.role}`)
```
`user_role` comes from `localStorage.erp_session`. An employee can edit localStorage and set `user_role=admin`, then call the API and receive all employee ledger accounts.  
**Fix:** Server must read role from a validated session, not trust client-provided params.

**SEC-7: ERP EXPENSE APPROVAL ROLE BYPASS (High)**  
`pages/api/erp/expenses.ts`:
```ts
if (approver_role && !['admin', 'manager'].includes(approver_role)) {
  return res.status(403).json({ error: 'Forbidden' })
}
```
The check is `if (approver_role && ...)` — if `approver_role` is **not sent at all**, the check is skipped. An employee can call PATCH without `approver_role` and approve their own expenses.  
**Fix:** Require `approver_role` to be present, or validate from server session.

### ⚠️ Warnings

- **Rate limiting is in-memory** — resets on server restart, not suitable for multi-instance/cluster deployments
- **Admin `sAdminSession` validation** only checks "is it truthy" — not a cryptographic token. Anyone with knowledge of the admin panel can construct the header.
- **WhatsApp business phone** (`447934519060`) hardcoded in 15+ places — should be a single constant or env var
- **Bank account details** (`Robert George Bennett`, `60-84-07`, `70745518`) hardcoded in `app/cart/page.tsx` line 488–490 — should be in site settings / env
- **`blog.ts` POST handler**: no validation that `title` exists before INSERT — could create empty blog posts

---

## ⚡ PILLAR 3: Performance & SEO

### ✅ What's Good
- **Connection pool** (`connectionLimit: 3`) prevents DB connection exhaustion.
- **Cloudinary** used for all new image uploads — CDN-delivered, auto-optimized.
- **Rate limiting** prevents API abuse on critical routes.
- **Sitemap** (`app/sitemap.ts`) correctly lists all public pages with proper priorities.
- **`robots.txt`** correctly blocks admin/ERP/API paths.
- **`generateMetadata()`** implemented for: layout, product pages, blog posts.
- **Layout metadata** in every page subdirectory via `layout.tsx` files.
- **JSON-LD structured data**: Product schema ✅, Article schema ✅, FAQPage schema ✅, BreadcrumbList on product/blog pages ✅.
- **TipTap editor** loaded with `dynamic(() => import(...), { ssr: false })` — no SSR bloat.
- **`export const dynamic = 'force-dynamic'`** on homepage, cart, products — prevents stale static cache.

### ❌ Issues Found

**PERF-1: ZERO `next/image` USAGE — ALL RAW `<img>` TAGS (High)**  
8 raw `<img>` tags found across public pages. `next/image` provides: automatic WebP conversion, lazy loading, blur placeholder, size optimization, and CDN delivery.  
Affected: product cards, blog featured images, hero section.  
**Fix:** Replace `<img>` with `<Image>` from `next/image` for all user-facing images.

**PERF-2: PRODUCT SLUG PAGE STILL USES `createConnection` (High)**  
`app/products/[slug]/page.tsx` creates a fresh MySQL connection on every SSR render instead of using the pool. On a busy product page with many SSR requests, this will re-hit the 500 connections/hour limit.  
**Fix:** Import `pool` from `lib/db` like all other API routes.

**PERF-3: SITEMAP MISSING INDIVIDUAL PRODUCT AND BLOG URLS (Medium)**  
`app/sitemap.ts` only lists static pages — it does NOT include:
- `/products/b1g-1-year-plan` (individual product pages)
- `/blog/how-to-set-up-your-firestick` (individual blog posts)  
Search engines cannot discover these pages via the sitemap.  
**Fix:** Fetch products and blog posts from DB in sitemap and add dynamic entries.

**PERF-4: MISSING SEO METADATA ON SEVERAL PAGES (Medium)**  
Pages without Twitter card metadata:
- `app/about/layout.tsx` — no `twitter` key
- `app/contact/layout.tsx` — no `twitter` key
- `app/faq/layout.tsx` — no `twitter` key
- `app/order-tracking/layout.tsx` — no `twitter` key
- `app/privacy-policy/layout.tsx` — no `twitter` key, no description

Pages missing OG image:
- About, Contact, FAQ, Order Tracking, Privacy Policy, Refund Policy, Terms — use only default og-image from root layout (not page-specific)

**PERF-5: MISSING JSON-LD ON SEVERAL PAGES (Medium)**  
- `app/about/page.tsx` — no Organization schema
- `app/contact/page.tsx` — no LocalBusiness or ContactPage schema
- `app/page.tsx` (homepage) — no WebSite or Store schema  
These are high-value SEO opportunities.

**PERF-6: `app/blog/page.tsx` = 330 LINES WITH INLINE STYLES (Low)**  
Large file with heavy inline styles. Should extract CSS to a stylesheet or component.

### ⚠️ Warnings

- **`og-default.svg`** used as the default OG image — WhatsApp and Facebook may not render SVG previews correctly. Should be a JPG/PNG at exactly 1200×630px.
- **DB queries lack indexes** — no `EXPLAIN` analysis was done, but tables like `erp_transactions`, `erp_expenses`, and `orders` are queried by `employee_id`, `account_id`, `status` frequently. Missing indexes will slow at scale.
- **`erp/payroll` runs N×3 queries per employee** (expenses, advances, attendance per employee) — `O(n)` DB calls. Should be rewritten with JOINs.
- **`lib/rateLimit.ts`** memory store resets on restart — provides zero protection against attacks that cause server restarts.

---

## 🎨 PILLAR 4: UI/UX Design

### ✅ What's Good
- **Consistent color theme**: `#5B21B6` purple, `#111111` dark, `#FFFFFF` white throughout all public pages.
- **Light theme migration complete** — all public pages are white-background/dark-text. No major dark-theme remnants on customer-facing pages.
- **ERP sidebar remains dark** — intentional contrast, matches admin aesthetic.
- **Mobile hamburger** standardized across pages — dark `#111111` button, white lines.
- **2-column product grid on mobile** — implemented on homepage and products page.
- **Contact page WhatsApp card** has featured styling (purple border, light lavender bg) — distinctive.
- **Modals** standardized to close only via Cancel/X button — no accidental backdrop close.
- **Add to Cart** toggle behavior — green when in cart, red on hover → "✕ Remove".
- **Form inputs** consistent: white bg, `#E5E5E5` border, purple focus ring.

### ❌ Issues Found

**UI-1: `app/sidhu/page.tsx` IS 1442 LINES — UNMAINTAINABLE (High)**  
The entire admin panel is in one file. Components are deeply nested inline (6–8 levels of JSX). No component separation. Modals, tables, forms all inline.  
**Fix:** Extract `<BlogModal />`, `<ProductModal />`, `<OrdersTable />`, `<DashboardStats />` etc.

**UI-2: ERP PAGES STILL HAVE DARK THEME REFERENCES (Medium)**  
Several ERP pages use hardcoded dark colors (from the pre-migration era) in inline styles:
- `var(--purple-glow)`, `var(--pg)`, `rgba(139,0,255,...)`, `rgba(255,255,255,0.4)` etc.
- These CSS variables are defined in `erpStyles` in `ERPLayout.tsx` as dark purple values
- Result: ERP has inconsistent contrast — some text is invisible on light backgrounds  
**Fix:** Audit all ERP page inline styles and replace dark-theme values.

**UI-3: INCONSISTENT BUTTON STYLES ACROSS ERP PAGES (Medium)**  
ERP uses `.erp-btn`, `.erp-btn-primary`, `.erp-btn-green`, `.erp-btn-red` from `ERPLayout.tsx`, but several pages also have raw inline `style={{background:...}}` buttons that don't match the design system.

**UI-4: PRODUCT DETAIL PAGE (`ProductDetail.tsx`) STILL HAS DARK THEME IN DATA DISPLAY (Low)**  
`product-category`, `product-short-desc`, `product-sections`, `section-block` classes still reference dark-theme colors like `rgba(255,255,255,0.65)` which would be invisible on the now-white background.

**UI-5: NO LOADING SKELETON/SPINNER ON ADMIN PAGE (Low)**  
Admin page initializes with demo data then swaps to real data. Users briefly see `FK44-62305` "John Smith" fake order before real orders load. No loading state indicator.

### ⚠️ Warnings

- **`app/cart/page.tsx` = 569 lines** — should split checkout steps into components
- **Heavy inline `<style>` blocks** in `app/products/page.tsx`, `app/blog/page.tsx`, `app/cart/page.tsx`, `app/contact/page.tsx` — duplicates CSS across pages. Should use `globals.css` or CSS modules.
- **`globals.css` override pattern** `html body .class { !important }` is used extensively — indicates specificity wars between inline styles and globals. A design token system would eliminate this.
- **ERP currency symbol**: after the PKR fix, `fmt()` returns `Rs. X` but the `currency` prop from `ERPLayout` is still `"PKR"` and unused in most pages.

---

## 🛒 PILLAR 5: Customer UX & Conversion

### ✅ What's Good
- **Complete checkout flow works**: Home → Products → Cart → Checkout → WhatsApp open → Order saved to DB.
- **WhatsApp message pre-filled** with full order details — customer just taps Send.
- **Cart persists** in `localStorage` with `mounted` guard — survives page refresh.
- **Add to Cart toggle** — button turns green (in cart) / red hover (remove) — clear visual feedback.
- **Coupon validation** with clear error messages and success confirmation.
- **Order tracking page** shows real-time 5-step progress with visual status dots.
- **Receipt upload** integrated (Cloudinary) — customers can upload payment receipt at checkout.
- **Payment Reference field** added — helps admin identify bank transfers.
- **Custom 404 page** exists (`app/not-found.tsx`) with proper metadata.
- **All APIs have try/catch** — no unhandled server crashes that would show raw errors.
- **VAT calculation** (20%) shown at checkout with transparent breakdown.

### ❌ Issues Found

**UX-1: BLOG CONTENT NOT SANITIZED BEFORE DISPLAY (Critical — also SEC-5)**  
`post.content` from DB is rendered raw via `dangerouslySetInnerHTML`. While TipTap outputs clean HTML in normal use, this is a security AND UX risk — malformed HTML from the DB would break the page layout.  
**Fix:** `import xss from 'xss'; ... dangerouslySetInnerHTML={{ __html: xss(post.content) }}`

**UX-2: NO SUCCESS STATE / CONFIRMATION EMAIL (High)**  
After order is placed and WhatsApp is opened, the success screen shows the order ID — but there is:
- No email confirmation sent to customer
- No SMS confirmation
- No order confirmation page at a dedicated URL (e.g. `/order-confirmation/ORD-123`)  
If the customer closes the browser, they have only the Order ID shown on screen. WhatsApp is the only confirmation mechanism.  
**Fix:** Add server-side email notification (e.g. via Resend/Nodemailer) on order creation.

**UX-3: ORDER TRACKING REQUIRES EXACT ORDER ID (Medium)**  
`/order-tracking` only accepts exact Order ID (`ORD-1234567890`). No email-based lookup. If customer loses their Order ID, they have no way to track their order.  
**Fix:** Add email-based lookup: "Enter your email to find your order".

**UX-4: CHECKOUT: NO FORM VALIDATION FEEDBACK (Medium)**  
Since mandatory field validation was removed (by design per user request), there is currently no feedback when a customer submits an empty checkout form. Order gets created with blank `customer_name`, `customer_email`, etc. — admin receives a WhatsApp with empty fields.  
**Fix:** Add soft warnings (not hard blocks): highlight empty fields with a yellow warning, but still allow submit.

**UX-5: CART ITEMS IMAGES SHOW EMOJI (📦) INSTEAD OF PRODUCT IMAGE (Low)**  
`app/cart/page.tsx` cart item display uses `<div className="cart-item-image">📦</div>` — no actual product image shown in the cart. Customers cannot visually confirm they added the right product.  
**Fix:** Pass `image` property through cart context and display thumbnail in cart.

**UX-6: NO MINIMUM ORDER / SHIPPING LOGIC DISPLAYED TO USER (Low)**  
The shipping fee (`£3.99` for non-subscription, `Free` for plans) is calculated silently. Users only see the final total. No "Add a plan to get free shipping!" upsell message.

### ⚠️ Warnings

- **`orders.ts` API** still returns ALL orders without pagination — if there are 500+ orders, a single call returns them all. Frontend pagination is client-side only; the DB still transfers all rows.
- **`handleOrder` submits with empty fields** — since validation was removed, an order can be created with blank name/email/phone. The WhatsApp message will show "undefined" or empty strings.
- **Blog post listing page** fetches ALL blog posts on every render — no pagination implemented for the blog listing.
- **Search API** (`/api/search`) has rate limiting but no auth — acceptable for a public search endpoint.

---

## 📊 SUMMARY SCORECARD

| Pillar | Score /10 | Status | Key Issue |
|--------|-----------|--------|-----------|
| Technical Architecture | 6/10 | 🟡 | Demo data in initial state, monolith admin file, 89× `:any` |
| Cybersecurity | 4/10 | 🔴 | Unprotected admin APIs, plaintext ERP password, client-trusted role params |
| Performance & SEO | 6/10 | 🟡 | No `next/image`, no dynamic sitemap, missing twitter cards |
| UI/UX Design | 7/10 | 🟡 | Good theme consistency, admin file too large, ERP has dark remnants |
| Customer UX & Conversion | 7/10 | 🟡 | Full checkout flow works, missing email confirm, no form feedback |
| **OVERALL** | **6/10** | 🟡 | **Functional but needs security hardening** |

---

## 🚀 PRIORITY FIX LIST

### 🔴 Critical (Fix Immediately)

1. **Remove DB credential fallbacks** from `app/products/[slug]/page.tsx` and `lib/db.ts` — use env vars only, throw if missing
2. **Hash ERP default password** in `pages/api/erp/login.ts` — never store `erp123` plaintext
3. **Add `checkAdminAuth()` to `blog.ts`, `faqs.ts`, `sections.ts`, `site-content.ts`, `upload.ts`, `upload-favicon.ts`** — all currently unprotected
4. **Sanitize blog content with `xss` package** — `xss` is already installed, just use it

### 🟠 High (Fix This Week)

5. **Server-side ERP session validation** on all `/api/erp/*` routes — stop trusting client-provided user_id / user_role
6. **Fix `app/products/[slug]/page.tsx`** — replace `createConnection` with pool import
7. **Fix ERP expense approval bypass** — make `approver_role` required, not optional
8. **Fix `user_role` in ledger query** — validate server-side, don't trust client header
9. **Replace demo data initial state** in admin with `useState([])` + proper loading state

### 🟡 Medium (Fix This Month)

10. **Dynamic sitemap** — add product URLs and blog post URLs from DB
11. **Add `next/image`** for product images on homepage, products page, product detail
12. **Add Twitter card metadata** to About, Contact, FAQ, Order Tracking pages
13. **Add Organization/LocalBusiness JSON-LD** to homepage and contact page
14. **Split admin panel** (`app/sidhu/page.tsx`) into tab components
15. **Add email confirmation** on order creation (via Resend or Nodemailer)
16. **Soft form validation** at checkout — warn on empty fields without blocking submit
17. **Add `og-default.jpg`** (1200×630 PNG/JPG) to replace the SVG OG default image

### 🟢 Low (Nice to Have)

18. **Add product image to cart items** display (currently shows 📦 emoji)
19. **Server-side orders pagination** in `admin-orders.ts` — don't return 500+ rows at once
20. **Email-based order lookup** on `/order-tracking` — "Forgot your Order ID? Enter email"
21. **Replace `dotenv` package** — Next.js handles `.env.local` natively; `dotenv` is redundant
22. **Audit ERP inline styles** — replace `rgba(255,255,255,0.4)` dark remnants in ERP pages
23. **Consolidate WhatsApp number** into a single constant file — 15+ hardcoded occurrences
24. **Extract bank details** to site settings instead of hardcoding in `cart/page.tsx`
25. **Add DB indexes** for frequently queried columns: `orders.status`, `erp_transactions.account_id`, `erp_expenses.employee_id`, `blog_posts.slug`

---

*Report generated by Claude Code CLI*  
*Audit completed: 5 June 2026*  
*NO code was modified during this audit*  
*Total files scanned: ~80 files across app/, pages/, lib/, components/, public/*
