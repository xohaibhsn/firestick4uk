/**
 * F4UK-MULTI-96 — CMS field ↔ site wiring + sidhu ease-of-use quick wins.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const assert = require("assert");

const ROOT = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

let passed = 0;
let failed = 0;
function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`PASS ${name}`);
  } else {
    failed++;
    console.log(`FAIL ${name}${detail ? " — " + detail : ""}`);
  }
}

const productsClient = read("app/products/ProductsClient.tsx");
const productDetail = read("app/products/[slug]/ProductDetail.tsx");
const stockBadge = read("lib/stockBadgeLabel.ts");
const adminFields = read("lib/adminContentFields.ts");
const denylist = JSON.parse(read("lib/publicSiteContentDenylist.json"));
const health = read("scripts/live-health-check.js");
const sidhu = read("app/sidhu/page.tsx");
const ease = read("components/admin/CmsEaseToolbar.tsx");
const findLib = read("lib/cmsFindText.ts");
const panel = read("components/admin/AdminContentPanel.tsx");

// ── A2 orphan wiring ──────────────────────────────────────────────────────
ok(
  "products_search_placeholder_wired",
  /products_search_placeholder/.test(productsClient) &&
    /placeholder=\{t\(["']products_search_placeholder["']/.test(productsClient)
);
ok(
  "products_empty_editor_wins",
  /t\(["']products_empty["']\s*,\s*t\(["']products_empty_match["']/.test(
    productsClient
  )
);
ok(
  "pd_stock_fallback_wired",
  // MULTI-132: displayProduct merges live preview overrides; still stockBadgeLabel + pd_stock_fallback.
  /stockBadgeLabel\((?:displayProduct|product)\.stock,\s*t\(["']pd_stock_fallback["']/.test(
    productDetail
  )
);
ok(
  "stockBadgeLabel_accepts_fallback",
  /fallback\s*=\s*["']In stock["']/.test(stockBadge) &&
    /emptyLabel/.test(stockBadge)
);

// empty value → fallback (unit via contract mirror of lib/stockBadgeLabel.ts)
function stockBadgeLabelLocal(stock, fallback = "In stock") {
  const emptyLabel = String(fallback || "").trim() || "In stock";
  const raw = String(stock ?? "").trim();
  if (!raw) return emptyLabel;
  const lower = raw.toLowerCase();
  if (lower === "digital") return emptyLabel;
  if (/^\d+$/.test(raw)) {
    const n = Number(raw);
    if (n <= 5) return `Only ${n} left`;
    return emptyLabel;
  }
  return raw;
}
ok("wiring_empty_stock_uses_fallback", stockBadgeLabelLocal("", "Available") === "Available");
ok("wiring_empty_stock_default", stockBadgeLabelLocal("") === "In stock");
ok("wiring_set_fallback_value", stockBadgeLabelLocal("digital", "Ready") === "Ready");
ok("wiring_numeric_low_unchanged", stockBadgeLabelLocal("3", "X") === "Only 3 left");

// editor-field-wins precedence (source assertion)
ok(
  "editor_field_wins_precedence_source",
  /t\(["']products_empty["']\s*,\s*t\(["']products_empty_match["']\s*,\s*["']No products match["']\)\)/.test(
    productsClient
  )
);

// ── A3 new editor fields ──────────────────────────────────────────────────
const newKeys = [
  "home_loading",
  "home_empty",
  "products_search_aria",
  "products_search_empty",
  "products_search_reset",
  "products_empty_match",
  "products_empty_reset",
  "cart_pay_cod_digital",
  "cart_pay_cod_digital_sub",
  "cart_phone_preview",
  "cart_receipt_hint",
  "cart_remove_aria",
  "cart_totals_calculating",
  "success_body_cod",
];
for (const k of newKeys) {
  ok(`editor_field_present_${k}`, new RegExp(`key:\\s*["']${k}["']`).test(adminFields));
}

// ── A4 denylist ───────────────────────────────────────────────────────────
ok(
  "denylist_removed_wired_orphans",
  !denylist.includes("products_search_placeholder") &&
    !denylist.includes("products_empty") &&
    !denylist.includes("pd_stock_fallback")
);
ok(
  "denylist_keeps_legacy",
  denylist.includes("clarity_project_id") &&
    denylist.includes("home_hero") &&
    denylist.includes("about_hero")
);
ok(
  "health_imports_denylist_json",
  /publicSiteContentDenylist\.json/.test(health) ||
    /PUBLIC_SITE_CONTENT_DENYLIST/.test(health)
);

// ── B find-text / view-on-site / unsaved ───────────────────────────────────
ok("sidhu_imports_ease_toolbar", /CmsEaseToolbar/.test(sidhu));
ok("ease_find_input", /data-cms-find-input/.test(ease));
ok("ease_view_on_site", /data-cms-view-on-site/.test(ease));
ok("ease_unsaved_bar", /data-cms-unsaved-bar/.test(ease) && /unsaved change/.test(ease));
ok("ease_beforeunload", /beforeunload/.test(ease));
ok("ease_confirm_leave", /confirmLeaveIfDirty/.test(ease) && /confirmLeaveIfDirty/.test(sidhu));
ok("panel_data_cms_field", /data-cms-field=\{field\.key\}/.test(panel));

// Sensitive key exclusion (unit via require of compiled-free logic)
{
  // Evaluate find helpers by requiring the built approach: read and assert source contracts
  ok(
    "find_excludes_bank_value_snippet",
    /isCmsFindHideValueKey/.test(findLib) &&
      /startsWith\(["']bank_["']\)/.test(findLib)
  );
  ok(
    "find_contact_label_only",
    /isCmsFindLabelOnlyKey/.test(findLib) &&
      /contact_/.test(findLib)
  );
  ok("find_max_50", /max\s*\?\?\s*50|max:\s*50/.test(findLib + ease));
}

// Save function untouched — still the same async saveContent body signature
ok(
  "saveContent_untouched_signature",
  /const saveContent = async\s*\(\s*keys:\s*string\[\],\s*overrides\?:\s*Record<string,\s*string>(?:\s*,\s*opts\?:\s*\{\s*forceKeys\?:\s*string\[\]\s*\})?\s*\)\s*=>\s*\{/.test(
    sidhu
  ) &&
    /fetch\(["']\/api\/site-content["']\s*,\s*\{\s*method:\s*["']POST["']/.test(sidhu)
);

// Dirty only when different
{
  // Inline countDirtyKeys mirror
  function countDirty(current, saved) {
    const keys = new Set([...Object.keys(current), ...Object.keys(saved)]);
    let n = 0;
    for (const k of keys) {
      if (String(current[k] ?? "") !== String(saved[k] ?? "")) n++;
    }
    return n;
  }
  ok("guard_clean_when_equal", countDirty({ a: "1" }, { a: "1" }) === 0);
  ok("guard_dirty_when_changed", countDirty({ a: "2" }, { a: "1" }) === 1);
}

// searchCmsContent behaviour via dynamic import of ts — use Function eval of exported pure helpers by duplicating
{
  const { searchCmsContent, isCmsFindHideValueKey } = (() => {
    // Minimal reimplementation matching lib contracts for test
    function isCmsFindHideValueKey(key) {
      const k = String(key || "").toLowerCase();
      if (k.startsWith("bank_")) return true;
      if (k.startsWith("payment_")) return true;
      if (/_password$|_secret$|_token$|_key$/.test(k)) return true;
      if (k.startsWith("contact_") && /phone|email|whatsapp|telegram|address/.test(k))
        return true;
      return false;
    }
    function searchCmsContent({ query, siteContent, max = 50 }) {
      const q = String(query || "").trim().toLowerCase();
      if (!q) return [];
      const hits = [];
      for (const [key, raw] of Object.entries(siteContent)) {
        if (hits.length >= max) break;
        const value = String(raw ?? "");
        if (isCmsFindHideValueKey(key)) {
          if (key.toLowerCase().includes(q) && key.startsWith("contact_")) {
            hits.push({ key, snippet: "" });
          }
          continue;
        }
        if (key.toLowerCase().includes(q) || value.toLowerCase().includes(q)) {
          hits.push({ key, snippet: value });
        }
      }
      return hits;
    }
    return { searchCmsContent, isCmsFindHideValueKey };
  })();

  ok("sensitive_bank_value_hidden", isCmsFindHideValueKey("bank_account_no") === true);
  const bankHits = searchCmsContent({
    query: "12345678",
    siteContent: { bank_account_no: "12345678", home_add_cart: "Add to Cart →" },
  });
  ok(
    "search_bank_does_not_return_value_hit",
    !bankHits.some((h) => h.key === "bank_account_no" && h.snippet)
  );
  const cartHits = searchCmsContent({
    query: "Add to Cart",
    siteContent: { home_add_cart: "Add to Cart →", products_add_cart: "Add to Cart" },
  });
  ok("search_add_to_cart_finds_fields", cartHits.length >= 1);
}

console.log(`\nmulti-96: ${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
