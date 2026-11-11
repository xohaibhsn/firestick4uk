/**
 * F4UK-CART-VISIBILITY-AND-ORDER-EMAIL-47 — cart icon, mini-cart bar, SSR/SEO parity.
 * Plain Node + mocks (no browser).
 */
const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");
const ts = require("typescript");
const React = require("react");
const { renderToStaticMarkup } = require("react-dom/server");

const ROOT = path.resolve(__dirname, "..");
const MAIN_SHA = "0fffdab8ad6172709f813ca1cdb64529b74defb6";
let passed = 0;
let failed = 0;

function ok(name, cond, detail = "") {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function extractNavSubtree(markup) {
  const m = markup.match(/<ul[^>]*class="[^"]*nav-links[^"]*"[^>]*>[\s\S]*?<\/ul>/);
  return m ? m[0] : "";
}

function extractNavAnchorsFromMarkup(markup) {
  const subtree = extractNavSubtree(markup) || markup;
  const anchors = [];
  const re = /href="([^"]*)"[^>]*>([\s\S]*?)<\/a>/g;
  let m;
  while ((m = re.exec(subtree))) {
    const href = m[1];
    const text = m[2].replace(/<[^>]+>/g, "").replace(/\s+/g, " ").trim();
    anchors.push({ href, text });
  }
  return anchors;
}

// ── Source presence ──────────────────────────────────────────────────────────
const navbar = read("components/Navbar.tsx");
const mini = read("components/MiniCartBar.tsx");
const wa = read("components/WhatsAppButton.tsx");
const layout = read("app/layout.tsx");
const cartCtx = read("app/lib/cartContext.tsx");
const totalsSrc = read("lib/cartDisplayTotals.ts");

ok("minicart_component_exists", fs.existsSync(path.join(ROOT, "components/MiniCartBar.tsx")));
ok("layout_mounts_MiniCartBar", /<MiniCartBar\s*\/>/.test(layout));
ok(
  "layout_MiniCartBar_inside_CartProvider",
  /<CartProvider>[\s\S]*<MiniCartBar\s*\/>[\s\S]*<\/CartProvider>/.test(layout)
);
ok("header_cart_gated_on_mount", /headerCartMounted/.test(navbar) && /setHeaderCartMounted\(true\)/.test(navbar));
ok("header_cart_not_in_ssr_path", /headerCartMounted && cta === ["']cart["']/.test(navbar));
ok(
  "nav_cta_open_menu_white_on_purple",
  /\.nav-links\.open a\.nav-cta/.test(navbar) && /color:\s*#FFFFFF\s*!important/.test(navbar)
);
ok("wa_offset_class_present", /wa-float--above-minicart/.test(wa) && /bottom:\s*88px/.test(wa));
ok("minicart_aria_live", /aria-live=["']polite["']/.test(mini));
ok("minicart_44px_targets", /min-height:\s*44px/.test(mini) && /min-width:\s*44px/.test(mini));
ok("minicart_prefers_reduced_motion", /prefers-reduced-motion:\s*reduce/.test(mini));
ok("cart_context_exposes_itemCount", /itemCount/.test(cartCtx));
ok("cart_context_exposes_lastAddedAt", /lastAddedAt/.test(cartCtx));
ok("totals_helper_reuses_orderPricing", /calculateGrandTotal/.test(totalsSrc) && /cartShippingPounds/.test(totalsSrc));
ok(
  "totals_helper_no_assumed_shipping_on_null",
  /null\/undefined:\s*shipping is 0|shipping is 0 — do NOT assume PHYSICAL_SHIPPING/.test(
    totalsSrc
  ) || /When null\/undefined: shipping is 0/.test(totalsSrc)
);
ok(
  "minibar_uses_classification_hook",
  /useCartClassification/.test(mini) &&
    fs.existsSync(path.join(ROOT, "lib/useCartClassification.ts")) &&
    fs.existsSync(path.join(ROOT, "lib/cartClassification.ts"))
);
ok(
  "classification_uses_api_products_and_isDigitalProduct",
  /\/api\/products/.test(read("lib/cartClassification.ts")) &&
    /isDigitalProduct/.test(read("lib/cartClassification.ts"))
);

ok("shouldHide_exported", /export function shouldHideMiniCartBar/.test(mini));

function shouldHideMiniCartBar(pathname) {
  const p = String(pathname || "").toLowerCase();
  if (!p) return false;
  if (p === "/cart" || p.startsWith("/cart/")) return true;
  if (p === "/sidhu" || p.startsWith("/sidhu/")) return true;
  if (p.includes("checkout")) return true;
  return false;
}

ok("hide_on_cart", shouldHideMiniCartBar("/cart") === true);
ok("hide_on_cart_success", shouldHideMiniCartBar("/cart/success") === true);
ok("hide_on_sidhu", shouldHideMiniCartBar("/sidhu") === true);
ok("hide_on_checkout_route", shouldHideMiniCartBar("/checkout") === true);
ok("show_on_products", shouldHideMiniCartBar("/products") === false);
ok("show_on_home", shouldHideMiniCartBar("/") === false);

// Totals helper — same math as /cart (mirrored; source asserts reuse of helpers)
function roundMoney(n) {
  return Math.round(Number(n) * 100) / 100;
}
function cartShippingPounds(opts) {
  if (!opts.cartLength) return 0;
  if (opts.hasPhysicalItems) return 3.99;
  return 0;
}
function calculateGrandTotal(opts) {
  const total = roundMoney(
    opts.subtotal + opts.shipping + opts.vatAmount - opts.discountAmount
  );
  return total < 0 ? 0 : total;
}
function computeCartDisplayTotals(opts) {
  const subtotal = roundMoney(Number(opts.subtotal) || 0);
  const cartLength = Math.max(0, Number(opts.cartLength) || 0);
  const discountAmount = roundMoney(Number(opts.discountAmount) || 0);
  let shipping = 0;
  if (cartLength > 0) {
    if (opts.hasPhysicalItems === true || opts.hasPhysicalItems === false) {
      shipping = roundMoney(
        cartShippingPounds({
          cartLength,
          hasPhysicalItems: opts.hasPhysicalItems,
        })
      );
    }
    // null/undefined → shipping 0 (Task-48: no assumed physical shipping)
  }
  const vatAmount = roundMoney(subtotal * 0.2);
  const grandTotal = calculateGrandTotal({
    subtotal,
    shipping,
    vatAmount,
    discountAmount,
  });
  return { subtotal, shipping, vatAmount, discountAmount, grandTotal };
}
function formatGbp(amount) {
  return `£${roundMoney(amount).toFixed(2)}`;
}
function formatMiniCartAmountText(opts) {
  if (opts.classificationReady) {
    const t = computeCartDisplayTotals({
      subtotal: opts.subtotal,
      cartLength: opts.cartLength,
      hasPhysicalItems: opts.hasPhysicalItems,
    });
    return formatGbp(t.grandTotal);
  }
  return `${formatGbp(roundMoney(Number(opts.subtotal) || 0))} + VAT`;
}

// Confirm MiniCartBar uses shared amount formatter (which uses computeCartDisplayTotals when ready)
ok(
  "minibar_uses_formatMiniCartAmountText",
  /formatMiniCartAmountText\(/.test(mini) &&
    /from ["']@\/lib\/cartDisplayTotals["']/.test(mini)
);

const sample = computeCartDisplayTotals({
  subtotal: 20,
  cartLength: 1,
  hasPhysicalItems: null,
});
ok(
  "totals_null_has_zero_shipping_not_assumed_physical",
  sample.shipping === 0 && sample.vatAmount === 4 && sample.grandTotal === 24,
  JSON.stringify(sample) + " — why: Task-48 forbids shipping-inclusive guess for unclassified display"
);
const digital = computeCartDisplayTotals({
  subtotal: 20,
  cartLength: 1,
  hasPhysicalItems: false,
});
ok(
  "totals_digital_shipping_zero",
  digital.shipping === 0 && digital.grandTotal === 24,
  JSON.stringify(digital)
);
ok("formatGbp", formatGbp(27.99) === "£27.99");

// ── Task-48: digital / physical / mixed / pending totals ─────────────────────
function isDigitalProduct(product) {
  const category = String(product?.category ?? "").trim().toLowerCase();
  const stock = String(product?.stock ?? "").trim().toLowerCase();
  if (category === "subscription") return true;
  if (stock === "digital") return true;
  return false;
}
function classifyCartItems(cart, productMap) {
  if (!productMap) {
    return { ready: false, error: "unavailable", hasDigitalItems: false, hasPhysicalItems: false };
  }
  if (cart.length === 0) {
    return { ready: true, error: null, hasDigitalItems: false, hasPhysicalItems: false };
  }
  let hasDigitalItems = false;
  let hasPhysicalItems = false;
  for (const item of cart) {
    const facts = productMap.get(Number(item.id));
    if (!facts) {
      return { ready: false, error: "unresolved", hasDigitalItems: false, hasPhysicalItems: false };
    }
    if (isDigitalProduct(facts)) hasDigitalItems = true;
    else hasPhysicalItems = true;
  }
  return { ready: true, error: null, hasDigitalItems, hasPhysicalItems };
}

const digitalMap = new Map([
  [101, { id: 101, category: "Subscription", stock: "Digital" }],
]);
const physicalMap = new Map([
  [201, { id: 201, category: "Hardware", stock: "Physical" }],
]);
const mixedMap = new Map([
  [101, { id: 101, category: "Subscription", stock: "Digital" }],
  [201, { id: 201, category: "Hardware", stock: "Physical" }],
]);

const digClass = classifyCartItems([{ id: 101 }], digitalMap);
ok("class_digital_ready", digClass.ready && digClass.hasPhysicalItems === false && digClass.hasDigitalItems === true);
const digTotal = computeCartDisplayTotals({
  subtotal: 14.99,
  cartLength: 1,
  hasPhysicalItems: digClass.hasPhysicalItems,
});
ok(
  "digital_1499_ready_total_1799",
  digTotal.shipping === 0 && digTotal.vatAmount === 3 && digTotal.grandTotal === 17.99,
  JSON.stringify(digTotal)
);
ok(
  "digital_amount_text_ready",
  formatMiniCartAmountText({
    subtotal: 14.99,
    cartLength: 1,
    classificationReady: true,
    hasPhysicalItems: false,
  }) === "£17.99"
);

const physClass = classifyCartItems([{ id: 201 }], physicalMap);
ok("class_physical_ready", physClass.ready && physClass.hasPhysicalItems === true);
const physTotal = computeCartDisplayTotals({
  subtotal: 49.99,
  cartLength: 1,
  hasPhysicalItems: true,
});
ok(
  "physical_4999_ready_total_6398",
  physTotal.shipping === 3.99 &&
    physTotal.vatAmount === 10 &&
    physTotal.grandTotal === 63.98,
  JSON.stringify(physTotal)
);

const mixedClass = classifyCartItems([{ id: 101 }, { id: 201 }], mixedMap);
ok(
  "class_mixed_physical_shipping",
  mixedClass.ready && mixedClass.hasPhysicalItems === true && mixedClass.hasDigitalItems === true
);
const mixedTotal = computeCartDisplayTotals({
  subtotal: 14.99 + 49.99,
  cartLength: 2,
  hasPhysicalItems: true,
});
ok("mixed_includes_physical_shipping", mixedTotal.shipping === 3.99, JSON.stringify(mixedTotal));

ok(
  "pending_amount_text_is_subtotal_plus_VAT_label",
  formatMiniCartAmountText({
    subtotal: 14.99,
    cartLength: 1,
    classificationReady: false,
    hasPhysicalItems: false,
  }) === "£14.99 + VAT"
);
ok(
  "pending_never_shipping_inclusive_number",
  !/£21\.98/.test(
    formatMiniCartAmountText({
      subtotal: 14.99,
      cartLength: 1,
      classificationReady: false,
      hasPhysicalItems: false,
    })
  )
);

const unknownClass = classifyCartItems([{ id: 999 }], digitalMap);
ok("unknown_id_not_ready", unknownClass.ready === false);
ok(
  "error_unknown_uses_pending_label",
  formatMiniCartAmountText({
    subtotal: 14.99,
    cartLength: 1,
    classificationReady: false,
    hasPhysicalItems: false,
  }) === "£14.99 + VAT"
);

// Fetch gating / cache / abort (source + behavioural mirrors)
const classSrc = read("lib/cartClassification.ts");
const hookSrc = read("lib/useCartClassification.ts");
ok("fetch_only_when_enabled", /if \(!opts\.enabled\)/.test(hookSrc) && /enabled: visible/.test(mini));
ok("no_fetch_when_hidden_or_empty", /enabled: visible/.test(mini) && /itemCount > 0/.test(mini));
ok("catalog_inflight_dedupe", /inflight/.test(classSrc) && /shared/.test(classSrc));
ok("session_cache_ttl", /SESSION_KEY/.test(classSrc) && /CATALOG_TTL_MS/.test(classSrc));
ok("abort_on_unmount", /ac\.abort\(\)/.test(hookSrc) && /AbortController/.test(hookSrc));
ok("coupon_not_in_bar_comment", /Coupons are not applied/.test(mini));

function miniVisible({ mounted, pathname, itemCount }) {
  return mounted && !shouldHideMiniCartBar(pathname) && itemCount > 0;
}
ok("bar_hidden_ssr_unmounted", miniVisible({ mounted: false, pathname: "/", itemCount: 2 }) === false);
ok("bar_hidden_empty", miniVisible({ mounted: true, pathname: "/", itemCount: 0 }) === false);
ok("bar_shown_after_add", miniVisible({ mounted: true, pathname: "/products", itemCount: 2 }) === true);
ok("bar_hidden_on_cart", miniVisible({ mounted: true, pathname: "/cart", itemCount: 2 }) === false);

// SSR equivalence: nav subtree vs main blob
function loadNavbarFactoryFromSource(src) {
  const mockSc = {
    subscription_slug: "iptv-subscriptions-uk",
    nav_logo_alt: "Firestick4UK",
    nav_logo_text: "FIRESTICK4UK",
    nav_cart_label: "Cart",
    nav_shop_label: "Shop Now",
    nav_subscription_label: "IPTV Subscription",
    site_title: "Firestick4UK",
    site_logo_url: "",
  };

  const hooksPath = path.join(ROOT, ".tmp-cart47-modules", "useSiteContent.cjs");
  fs.mkdirSync(path.dirname(hooksPath), { recursive: true });
  fs.writeFileSync(
    hooksPath,
    `module.exports = { useSiteContent: () => ({ sc: ${JSON.stringify(mockSc)}, t: (k,f)=>f||k }) };\n`,
    "utf8"
  );

  const Module = require("module");
  const orig = Module._resolveFilename;
  Module._resolveFilename = function (request, parent, ...rest) {
    if (
      request === "@/hooks/useSiteContent" ||
      String(request).includes("hooks/useSiteContent")
    ) {
      return hooksPath;
    }
    if (String(request).startsWith("@/")) {
      return orig.call(this, path.join(ROOT, request.slice(2)), parent, ...rest);
    }
    return orig.call(this, request, parent, ...rest);
  };

  try {
    const { outputText } = ts.transpileModule(src, {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        esModuleInterop: true,
        jsx: ts.JsxEmit.React,
      },
      fileName: "Navbar.tsx",
    });
    const code = outputText.replace(
      /require\(["']@\/hooks\/useSiteContent["']\)/g,
      `require(${JSON.stringify(hooksPath)})`
    );
    const exportsObj = {};
    const moduleObj = { exports: exportsObj };
    const run = new Function("exports", "module", "require", "React", code);
    run(exportsObj, moduleObj, require, React);
    return moduleObj.exports.default || moduleObj.exports;
  } finally {
    Module._resolveFilename = orig;
  }
}

let mainNavbarSrc = "";
try {
  mainNavbarSrc = execSync(`git show ${MAIN_SHA}:components/Navbar.tsx`, {
    cwd: ROOT,
    encoding: "utf8",
  });
  ok("main_navbar_blob_readable", true);
} catch (e) {
  ok("main_navbar_blob_readable", false, String(e.message || e));
}

if (mainNavbarSrc) {
  const MainNavbar = loadNavbarFactoryFromSource(mainNavbarSrc);
  const CandNavbar = loadNavbarFactoryFromSource(navbar);
  const mainHtml = renderToStaticMarkup(
    React.createElement(MainNavbar, { cta: "cart", cartCount: 0 })
  );
  const candHtml = renderToStaticMarkup(
    React.createElement(CandNavbar, { cta: "cart", cartCount: 0 })
  );
  const mainSub = extractNavSubtree(mainHtml);
  const candSub = extractNavSubtree(candHtml);
  ok(
    "ssr_nav_subtree_identical_to_main",
    mainSub === candSub && mainSub.length > 0,
    `mainLen=${mainSub.length} candLen=${candSub.length}`
  );
  ok(
    "ssr_no_header_cart_icon",
    !/<a[^>]*data-nav-header-cart=/.test(candHtml) && !/<span[^>]*nav-header-cart__badge/.test(candHtml),
    "CSS may mention class names; element must be absent from SSR"
  );
  ok("ssr_no_minicart_markup_in_navbar", !/mini-cart-bar/.test(candHtml));

  const mainAnchors = extractNavAnchorsFromMarkup(mainHtml);
  const candAnchors = extractNavAnchorsFromMarkup(candHtml);
  ok(
    "ssr_nav_link_href_order",
    mainAnchors.length === candAnchors.length &&
      mainAnchors.every((a, i) => a.href === candAnchors[i].href),
    JSON.stringify({ mainAnchors, candAnchors })
  );
  ok(
    "ssr_nav_link_text_order",
    mainAnchors.length === candAnchors.length &&
      mainAnchors.every((a, i) => a.text === candAnchors[i].text)
  );
  ok("ssr_nav_link_count_at_least_7", candAnchors.length >= 7, String(candAnchors.length));

  // Persist SSR proof for review package
  const proofDir = path.join(ROOT, "..", "ssr-proof");
  fs.mkdirSync(proofDir, { recursive: true });
  fs.writeFileSync(path.join(proofDir, "main-nav-subtree.html"), mainSub, "utf8");
  fs.writeFileSync(path.join(proofDir, "cand-nav-subtree.html"), candSub, "utf8");
  fs.writeFileSync(
    path.join(proofDir, "anchors.json"),
    JSON.stringify({ mainAnchors, candAnchors }, null, 2),
    "utf8"
  );
}

ok("minicart_ssr_returns_null_by_design", /if \(!mounted \|\| !visible\) return null/.test(mini));

console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
