/**
 * F4UK-MULTI-156 — polish batch C (source assertions; no network).
 */
"use strict";

const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE = "b409239f8ed1ab840f9fab5a90870cb743adf88e";

let passed = 0;
let failed = 0;

function ok(name, cond, detail) {
  if (cond) {
    passed++;
    console.log(`PASS  ${name}${detail ? " — " + detail : ""}`);
  } else {
    failed++;
    console.log(`FAIL  ${name}${detail ? " — " + detail : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function gitShow(sha, rel) {
  const r = spawnSync("git", ["show", `${sha}:${rel}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  return r.status === 0 ? r.stdout : "";
}

function extractTKeys(src) {
  const keys = [];
  const re = /\bt\(\s*["']([^"']+)["']/g;
  let m;
  while ((m = re.exec(src))) keys.push(m[1]);
  return keys.sort();
}

function extractHrefs(src) {
  const keys = [];
  const re = /\bhref\s*=\s*(?:\{([^}]*)\}|"([^"]*)"|'([^']*)')/g;
  let m;
  while ((m = re.exec(src))) {
    keys.push((m[1] || m[2] || m[3] || "").replace(/\s+/g, " ").trim());
  }
  return keys.sort();
}

function extractOptions(src) {
  const m = src.match(
    /SEASONAL_PROMO_STYLE_OPTIONS\s*=\s*\[([\s\S]*?)\]\s*as const/
  );
  if (!m) return null;
  const pairs = [];
  const re = /\{\s*value:\s*"([^"]+)"\s*,\s*label:\s*"([^"]+)"\s*\}/g;
  let hit;
  while ((hit = re.exec(m[1]))) pairs.push({ value: hit[1], label: hit[2] });
  return pairs;
}

function main() {
  console.log("phase-multi-156-tests");
  console.log(`BASE=${BASE}`);

  const cart = read("app/cart/page.tsx");
  const products = read("app/products/ProductsClient.tsx");
  const contact = read("app/contact/page.tsx");
  const home = read("app/HomeClient.tsx");
  const tracking = read("app/order-tracking/page.tsx");
  const pdp = read("app/products/[slug]/ProductDetail.tsx");
  const blog = read("app/blog/[slug]/BlogPostClient.tsx");

  // F1
  ok(
    "f1_back_color_minheight",
    /setStep\("cart"\)[\s\S]{0,200}?color:"#5B21B6"[\s\S]{0,120}?minHeight:44/.test(
      cart
    ) ||
      /color:"#5B21B6"[\s\S]{0,200}?minHeight:44[\s\S]{0,120}?setStep\("cart"\)/.test(
        cart
      ) ||
      /onClick=\{\(\)\s*=>\s*setStep\("cart"\)\}\s*style=\{\{[^}]*color:"#5B21B6"[^}]*minHeight:44/.test(
        cart
      )
  );
  const backStyle = cart.match(
    /onClick=\{\(\)\s*=>\s*setStep\("cart"\)\}\s*style=\{\{([^}]+)\}\}/
  );
  ok(
    "f1_back_style_block",
    !!backStyle &&
      /color:"#5B21B6"/.test(backStyle[1]) &&
      /minHeight:44/.test(backStyle[1]) &&
      /fontWeight:600/.test(backStyle[1]) &&
      /textDecoration:"underline"/.test(backStyle[1])
  );
  ok(
    "f1_no_invisible_rgba",
    !/onClick=\{\(\)\s*=>\s*setStep\("cart"\)\}\s*style=\{\{[^}]*rgba\(255,255,255,0\.4\)/.test(
      cart
    )
  );
  ok("f1_cart_back_key", /t\("cart_back"/.test(cart));
  ok("f1_setstep_cart", /setStep\("cart"\)/.test(cart));

  // F2 cart error
  ok(
    "f2_cart_error_box",
    /background:"#FEF2F2"/.test(cart) &&
      /border:"1px solid #FECACA"/.test(cart) &&
      /color:"#B91C1C"/.test(cart)
  );
  ok("f2_no_ff8888", !/#ff8888/i.test(cart));
  ok(
    "f2_retry_btn",
    /background:"#FFFFFF"[\s\S]{0,80}?border:"1px solid #FCA5A5"[\s\S]{0,80}?color:"#B91C1C"[\s\S]{0,80}?minHeight:44/.test(
      cart
    )
  );
  ok("f2_products_error_111", /color:"#111111"[\s\S]{0,40}?products_error/.test(products) || /products_error[\s\S]{0,80}?color:"#111111"/.test(products) || /style=\{\{color:"#111111",marginBottom:"8px"\}\}/.test(products));
  ok(
    "f2_products_error_666",
    /style=\{\{color:"#666666",fontSize:"13px",marginBottom:"20px"\}\}/.test(
      products
    )
  );
  ok(
    "f2_try_again_bg",
    /background:"#5B21B6",color:"#FFFFFF"/.test(products) &&
      /products_retry/.test(products)
  );
  ok(
    "f2_t_keys_unchanged",
    /t\("products_error"/.test(products) &&
      /t\("products_error_help"/.test(products) &&
      /t\("products_retry"/.test(products) &&
      /t\("cart_retry"/.test(cart)
  );

  // F3
  ok(
    "f3_separator",
    /color:"#999999"[\s\S]{0,20}?—/.test(products) ||
      /style=\{\{color:"#999999",fontSize:13\}\}>—</.test(products)
  );
  ok("f3_no_rgba_03", !/rgba\(255,255,255,0\.3\)/.test(products));

  // F4 iOS zoom
  ok(
    "f4_cart_16px",
    /@media\(max-width:768px\)\{[^}]*\.form-group input,\s*\.form-group textarea,\s*\.phone-row select\s*\{\s*font-size:16px/.test(
      cart
    ) && /\.coupon-input\{\s*font-size:16px\s*!important/.test(cart)
  );
  ok("f4_coupon_classname", /className="coupon-input"/.test(cart));
  ok(
    "f4_contact_16px",
    /@media\(max-width:768px\)\{[\s\S]*?\.form-group input,\s*\.form-group select,\s*\.form-group textarea\s*\{\s*font-size:16px/.test(
      contact
    )
  );
  ok(
    "f4_home_search_16",
    /\.search-input\{font-size:16px/.test(home) &&
      !/\.search-input\{font-size:14px;\}/.test(home)
  );
  ok(
    "f4_products_classnames",
    /className="products-search-input"/.test(products) &&
      (products.match(/className="products-price-input"/g) || []).length ===
        2 &&
      /className="products-sort-select"/.test(products)
  );
  ok(
    "f4_products_16px",
    /@media\(max-width:768px\)\{[\s\S]*?\.products-search-input,\s*\.products-price-input,\s*\.products-sort-select\s*\{\s*font-size:16px\s*!important/.test(
      products
    )
  );
  ok(
    "f4_tracking_16px",
    /@media\(max-width:768px\)\{\s*\.search-input\s*\{\s*font-size:16px/.test(
      tracking
    )
  );

  // F5 phone 320
  ok(
    "f5_phone_wrap",
    /@media\(max-width:360px\)\{\s*\.phone-row\s*\{\s*flex-wrap:wrap/.test(cart)
  );
  const baseCart = gitShow(BASE, "app/cart/page.tsx");
  const phoneBase =
    baseCart.match(
      /\.phone-row \{ display:flex; gap:8px; align-items:stretch; width:100%; max-width:100%; min-width:0; box-sizing:border-box; \}\n  \.phone-row select \{[^}]+\}\n  \.form-group \.phone-row input \{[^}]+\}/
    ) || [];
  const phoneNow =
    cart.match(
      /\.phone-row \{ display:flex; gap:8px; align-items:stretch; width:100%; max-width:100%; min-width:0; box-sizing:border-box; \}\n  \.phone-row select \{[^}]+\}\n  \.form-group \.phone-row input \{[^}]+\}/
    ) || [];
  ok(
    "f5_base_phone_byte_identical",
    phoneBase[0] && phoneNow[0] && phoneBase[0] === phoneNow[0]
  );

  // F6 tap targets
  ok(
    "f6_back_link",
    /\.back-link\{\s*min-height:44px;\s*margin-bottom:12px;\s*\}/.test(pdp)
  );
  ok(
    "f6_blog_breadcrumb",
    /\.breadcrumb a\{\s*display:inline-flex;\s*align-items:center;\s*min-height:44px;\s*\}/.test(
      blog
    ) &&
      /\.breadcrumb\{\s*margin-bottom:4px;\s*\}/.test(blog) &&
      /\.back\{\s*min-height:44px;\s*margin-bottom:12px;\s*\}/.test(blog)
  );
  ok(
    "f6_home_search_tap",
    /\.search-input\{[^}]*min-height:44px/.test(home) &&
      /\.search-btn\{[^}]*min-height:44px/.test(home) &&
      /\.view-all-link\{\s*display:inline-flex;\s*align-items:center;\s*min-height:44px/.test(
        home
      )
  );
  const basePdp = gitShow(BASE, "app/products/[slug]/ProductDetail.tsx");
  const baseBlog = gitShow(BASE, "app/blog/[slug]/BlogPostClient.tsx");
  const baseHome = gitShow(BASE, "app/HomeClient.tsx");
  const desktopBack =
    ".back-link{color:#666666;text-decoration:none;font-size:14px;display:inline-flex;align-items:center;gap:6px;margin-bottom:24px;transition:color 0.2s;}";
  const desktopCrumb =
    ".breadcrumb{font-size:12px;color:#888888;margin-bottom:16px;display:flex;gap:8px;align-items:center;}";
  const desktopBackBlog =
    ".back{color:#666666;text-decoration:none;font-size:13px;display:inline-flex;align-items:center;gap:5px;margin-bottom:24px;transition:color 0.2s;}";
  ok(
    "f6_desktop_back_link_identical",
    basePdp.includes(desktopBack) && pdp.includes(desktopBack)
  );
  ok(
    "f6_desktop_breadcrumb_identical",
    baseBlog.includes(desktopCrumb) &&
      blog.includes(desktopCrumb) &&
      baseBlog.includes(desktopBackBlog) &&
      blog.includes(desktopBackBlog)
  );
  const homeDesktopSearch =
    ".search-input { flex:1; border:none; outline:none; font-size:16px; color:#111111; background:transparent; font-family:var(--font-body); padding:8px 0; }";
  ok(
    "f6_desktop_home_search_identical",
    baseHome.includes(homeDesktopSearch) && home.includes(homeDesktopSearch)
  );

  // F7 options sync
  const optsA = extractOptions(read("lib/seasonalPromoStyle.ts"));
  const optsB = extractOptions(read("lib/adminContentFields.ts"));
  ok("f7_options_extracted", !!optsA && !!optsB && optsA.length > 0);
  ok(
    "f7_options_identical",
    JSON.stringify(optsA) === JSON.stringify(optsB),
    JSON.stringify(optsA) === JSON.stringify(optsB)
      ? `${optsA.length} pairs`
      : `A=${JSON.stringify(optsA)} B=${JSON.stringify(optsB)}`
  );

  // No href/text change vs BASE
  const appFiles = [
    "app/cart/page.tsx",
    "app/products/ProductsClient.tsx",
    "app/contact/page.tsx",
    "app/HomeClient.tsx",
    "app/order-tracking/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
  ];
  for (const rel of appFiles) {
    const now = read(rel);
    const was = gitShow(BASE, rel);
    const tkNow = extractTKeys(now).join("\n");
    const tkWas = extractTKeys(was).join("\n");
    const hrefNow = extractHrefs(now).join("\n");
    const hrefWas = extractHrefs(was).join("\n");
    ok(`tkeys_unchanged_${rel}`, tkNow === tkWas);
    ok(`hrefs_unchanged_${rel}`, hrefNow === hrefWas);
  }

  // Scope guard
  const allowed = new Set([
    "app/cart/page.tsx",
    "app/products/ProductsClient.tsx",
    "app/contact/page.tsx",
    "app/HomeClient.tsx",
    "app/order-tracking/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
    "scripts/phase-multi-156-tests.js",
  ]);
  const phaseTestRe = /^scripts\/phase-[a-z0-9-]+-tests\.js$/;

  const diff = spawnSync("git", ["diff", "--name-only", `${BASE}..HEAD`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const unstaged = spawnSync("git", ["diff", "--name-only"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const staged = spawnSync("git", ["diff", "--name-only", "--cached"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const untracked = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard"],
    { cwd: ROOT, encoding: "utf8" }
  );

  ok(
    "git_commands_ok",
    diff.status === 0 &&
      unstaged.status === 0 &&
      staged.status === 0 &&
      untracked.status === 0
  );

  const names = new Set(
    [diff.stdout, unstaged.stdout, staged.stdout, untracked.stdout]
      .join("\n")
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean)
  );

  const bad = [...names].filter((n) => !allowed.has(n) && !phaseTestRe.test(n));
  ok("scope_guard", bad.length === 0, bad.length ? bad.join(",") : "ok");

  console.log(`\nMULTI-156 results: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
