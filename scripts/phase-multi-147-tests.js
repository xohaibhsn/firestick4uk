/**
 * F4UK-MULTI-147 — UX-BATCH-2: optional-tag dedupe, contact phone hint, PDP sticky ATC tuck.
 * No real network/DB.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const { createHash } = require("crypto");
const { spawnSync } = require("child_process");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
const BASE = "afdbbb0071d33a582d72c7dc713e3740ee627fb7";

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

function sha256(s) {
  return createHash("sha256").update(String(s), "utf8").digest("hex");
}

function gitShow(ref, rel) {
  const r = spawnSync("git", ["show", `${ref}:${rel}`], {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 20 * 1024 * 1024,
  });
  if (r.status !== 0) throw new Error(r.stderr || `git show failed: ${ref}:${rel}`);
  return r.stdout;
}

function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: abs,
  }).outputText;
  const m = new Module(abs);
  m.filename = abs;
  m.paths = Module._nodeModulePaths(path.dirname(abs));
  const orig = Module._load;
  if (Object.keys(stubs).length) {
    Module._load = function (request, parent, isMain) {
      if (Object.prototype.hasOwnProperty.call(stubs, request)) return stubs[request];
      return orig(request, parent, isMain);
    };
  }
  try {
    m._compile(out, abs);
    return m.exports;
  } finally {
    Module._load = orig;
  }
}

// ─── labelHasOptional ───────────────────────────────────────────────────────

function runLabelTests() {
  console.log("\n# labelHasOptional");
  const mod = loadTs("lib/optionalLabel.ts");
  const fn = mod.labelHasOptional;
  ok("optional_paren_true", fn("Order Notes (Optional)") === true);
  ok("optional_word_true", fn("optional") === true);
  ok("optionally_false", fn("Optionally") === false);
  ok("notes_false", fn("Notes") === false);
  ok("non_string_null_false", fn(null) === false);
  ok("non_string_num_false", fn(42) === false);
  ok("non_string_obj_false", fn({}) === false);
  ok("never_throws_symbol", (() => {
    try {
      return fn(Symbol("x")) === false;
    } catch {
      return false;
    }
  })());
}

// ─── cart/page.tsx ──────────────────────────────────────────────────────────

function runCartTests() {
  console.log("\n# cart/page.tsx");
  const src = read("app/cart/page.tsx");
  const base = gitShow(BASE, "app/cart/page.tsx");

  ok("imports_labelHasOptional", /from\s+["']@\/lib\/optionalLabel["']/.test(src));

  ok(
    "opt_tag_name_address_gated",
    /!isEmail && !labelHasOptional\(f\.label\) && <span className="opt-tag">/.test(src)
  );
  ok(
    "opt_tag_city_gated",
    /checkout-city[\s\S]{0,200}!labelHasOptional\(t\(["']cart_lbl_city["']/.test(src) &&
      /checkout-city[\s\S]{0,320}opt-tag[\s\S]{0,80}cart_optional_tag/.test(src)
  );
  ok(
    "opt_tag_postcode_gated",
    /checkout-postcode[\s\S]{0,200}!labelHasOptional\(t\(["']cart_lbl_postcode["']/.test(src) &&
      /checkout-postcode[\s\S]{0,320}opt-tag[\s\S]{0,80}cart_optional_tag/.test(src)
  );
  ok(
    "opt_tag_notes_gated",
    /checkout-notes[\s\S]{0,200}!labelHasOptional\(t\(["']cart_lbl_notes["']/.test(src) &&
      /checkout-notes[\s\S]{0,400}opt-tag[\s\S]{0,80}cart_optional_tag/.test(src)
  );

  // All 5 conceptual sites gated (name+address share one render)
  const gateCount = (src.match(/!labelHasOptional\(/g) || []).length;
  ok("labelHasOptional_gate_count_ge_4", gateCount >= 4, `count=${gateCount}`);

  // req-star unchanged
  const starRe = /<span className="req-star" aria-hidden="true">\*<\/span>/g;
  ok(
    "req_star_count_unchanged",
    (base.match(starRe) || []).length === (src.match(starRe) || []).length
  );
  ok("email_req_star_present", /isEmail && <span className="req-star"/.test(src));
  ok(
    "phone_req_star_present",
    /cart_lbl_phone[\s\S]{0,120}<span className="req-star" aria-hidden="true">\*<\/span>/.test(src)
  );

  function hashValidateRegion(text) {
    const m = text.match(
      /\/\/ Mandatory email \+ international phone[\s\S]*?setFieldErrors\(\{\}\);/
    );
    return m ? sha256(m[0]) : null;
  }
  const hBase = hashValidateRegion(base);
  const hNow = hashValidateRegion(src);
  ok(
    "validateCheckout_block_byte_identical",
    !!hBase && hBase === hNow,
    `base=${hBase} now=${hNow}`
  );

  // Broader submit-ish: count of validateCheckoutContact unchanged
  ok(
    "validateCheckoutContact_call_count",
    (base.match(/validateCheckoutContact\(/g) || []).length ===
      (src.match(/validateCheckoutContact\(/g) || []).length
  );

  const attrSnippets = [
    'key:"name", type:"text", placeholder:"John Smith", name:"name", autoComplete:"name"',
    'key:"email", type:"email", placeholder:"john@example.com", name:"email", autoComplete:"email"',
    'key:"address", type:"text", placeholder:"123 High Street", name:"street-address", autoComplete:"street-address"',
    'name="tel"',
    'autoComplete="tel-national"',
    'name="address-level2"',
    'name="postal-code"',
    'name="order-notes"',
  ];
  for (const snip of attrSnippets) {
    ok(`attr_unchanged_${snip.slice(0, 24).replace(/\W+/g, "_")}`, src.includes(snip) && base.includes(snip));
  }
}

// ─── contact/page.tsx ───────────────────────────────────────────────────────

function runContactTests() {
  console.log("\n# contact/page.tsx");
  const src = read("app/contact/page.tsx");
  const base = gitShow(BASE, "app/contact/page.tsx");

  ok("imports_labelHasOptional", /from\s+["']@\/lib\/optionalLabel["']/.test(src));
  ok(
    "phone_opt_tag_gated",
    /contact_lbl_phone[\s\S]{0,400}!labelHasOptional\(t\(["']contact_lbl_phone["'][\s\S]{0,200}opt-tag[\s\S]{0,80}cart_optional_tag/.test(
      src
    )
  );
  ok(
    "phone_skips_when_star_in_label",
    /contact_lbl_phone[\s\S]{0,400}\.includes\(["']\*["']\)/.test(src)
  );
  ok(
    "opt_tag_css_present",
    /\.form-group\s+\.opt-tag\s*\{[^}]*font-size:\s*0\.8em[^}]*color:\s*#666666/.test(src)
  );

  function hashSubmit(text) {
    const m = text.match(/const handleSubmit = async \(\) => \{[\s\S]*?\n  \};/);
    return m ? sha256(m[0]) : null;
  }
  const hBase = hashSubmit(base);
  const hNow = hashSubmit(src);
  ok("handleSubmit_byte_identical", !!hBase && hBase === hNow, `base=${hBase} now=${hNow}`);

  // Only phone label / import / opt-tag style changed — name/email/message labels identical
  ok(
    "name_label_unchanged",
    /t\(["']contact_lbl_name["'],\s*["']Your Name \*["']\)/.test(src) &&
      src.includes(base.match(/t\(["']contact_lbl_name["'],\s*["']Your Name \*["']\)/)[0])
  );
  ok(
    "email_label_unchanged",
    /t\(["']contact_lbl_email["'],\s*["']Email \*["']\)/.test(src)
  );
  ok(
    "message_label_unchanged",
    /t\(["']contact_lbl_message["'],\s*["']Message \*["']\)/.test(src)
  );
}

// ─── ProductDetail.tsx ──────────────────────────────────────────────────────

function runPdpTests() {
  console.log("\n# ProductDetail.tsx");
  const src = read("app/products/[slug]/ProductDetail.tsx");
  const base = gitShow(BASE, "app/products/[slug]/ProductDetail.tsx");

  function hashBodyClass(text) {
    const m = text.match(
      /\/\/ Sticky mobile ATC: hide mini-cart while this bar is active[\s\S]*?\}, \[displayProduct\]\);/
    );
    return m ? sha256(m[0]) : null;
  }
  const hBodyBase = hashBodyClass(base);
  const hBodyNow = hashBodyClass(src);
  ok(
    "body_class_effect_byte_identical",
    !!hBodyBase && hBodyBase === hBodyNow,
    `base=${hBodyBase} now=${hBodyNow}`
  );

  ok(
    "intersection_observer_typeof_guard",
    /typeof IntersectionObserver === ["']undefined["']/.test(src)
  );
  ok(
    "intersection_observer_root_margin",
    /rootMargin:\s*["']0px 0px -56px 0px["']/.test(src)
  );
  ok("tucked_class_toggle", /pdp-sticky-atc--tucked/.test(src));
  ok("inline_atc_ref", /ref=\{inlineAtcRef\}/.test(src));
  ok("sticky_bar_ref", /ref=\{stickyAtcBarRef\}/.test(src));
  ok("io_disconnect_on_unmount", /io\.disconnect\(\)/.test(src));

  // Handlers / texts / data attrs unchanged
  ok('data_pdp_atc_inline', /data-pdp-atc=["']inline["']/.test(src));
  ok('data_pdp_atc_sticky', /data-pdp-atc=["']sticky["']/.test(src));
  ok('data_pdp_sticky_bar', /data-pdp-sticky-atc-bar=["']1["']/.test(src));
  ok(
    "pd_add_cart_text",
    /t\(["']pd_add_cart["'],\s*["']Add to Cart →["']\)/.test(src)
  );
  ok(
    "inline_onclick_unchanged_shape",
    /onClick=\{\(\) => \(productPreviewMode \? undefined : isInCart \? handleRemove\(\) : handleAdd\(\)\)\}/.test(
      src
    )
  );

  // CSS: tucked rules only inside the layout max-width 768 block (the one with sticky flex).
  const stickyFlexIdx = src.indexOf(
    ".pdp-sticky-atc{\n            display:flex;position:fixed"
  );
  const mobileStart =
    stickyFlexIdx >= 0
      ? src.lastIndexOf("@media(max-width:768px){", stickyFlexIdx)
      : -1;
  const styleEnd = mobileStart >= 0 ? src.indexOf("`}</style>", mobileStart) : -1;
  const mobileBlock =
    mobileStart >= 0 && styleEnd > mobileStart
      ? src.slice(mobileStart, styleEnd)
      : "";
  const desktopBefore =
    mobileStart >= 0 ? src.slice(0, mobileStart) : src;
  ok(
    "tucked_css_inside_mobile_block",
    /\.pdp-sticky-atc\.pdp-sticky-atc--tucked\{transform:translateY\(110%\);opacity:0;pointer-events:none;\}/.test(
      mobileBlock
    ) && !/\.pdp-sticky-atc--tucked/.test(desktopBefore)
  );
  ok(
    "transition_css_inside_mobile_block",
    /transition:transform \.2s ease, opacity \.2s ease/.test(mobileBlock) &&
      !/transition:transform \.2s ease, opacity \.2s ease/.test(desktopBefore)
  );
  ok(
    "prefers_reduced_motion_inside_mobile",
    /@media \(prefers-reduced-motion: reduce\)\{\s*\.pdp-sticky-atc\{transition:none;\}/.test(
      mobileBlock
    )
  );
  ok(
    "no_display_none_for_sticky_on_mobile",
    !/\.pdp-sticky-atc\{[^}]*display:\s*none/.test(mobileBlock) &&
      /display:flex;position:fixed/.test(mobileBlock)
  );
  // Desktop still display:none
  ok(
    "desktop_sticky_display_none",
    /\.pdp-sticky-atc\{display:none;\}/.test(desktopBefore)
  );
}

// ─── no-forbidden-diff ──────────────────────────────────────────────────────

function runDiffAllowlist() {
  console.log("\n# no-forbidden-diff");
  const allowed = new Set([
    "lib/optionalLabel.ts",
    "app/cart/page.tsx",
    "app/contact/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-ux-batch-51-tests.js",
    "scripts/phase-seasonal-ux-72-tests.js",
    "scripts/phase-multi-128-tests.js",

    // F4UK-MULTI-148: hydration-safe seasonal card countdown + London blog dates.
    "components/product/SeasonalCardCountdown.tsx",
    "app/blog/BlogClient.tsx",
    "app/blog/[slug]/BlogPostClient.tsx",
    "lib/blogDateFormat.ts",
    "scripts/phase-multi-148-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",

    // F4UK-MULTI-149: compact mobile consent banner (presentation only).
    "components/TrackingConsent.tsx",
    "scripts/phase-multi-149-tests.js",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-133-tests.js",
    "scripts/phase-multi-135-tests.js",
    "scripts/phase-multi-136-tests.js",
    "scripts/phase-multi-137-tests.js",
    "scripts/phase-multi-138-tests.js",
    "scripts/phase-multi-139-tests.js",
    "scripts/phase-multi-140-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-144-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-148-tests.js",
// F4UK-MULTI-150: product drafts (Draft/Publish D4).
    "lib/contentDrafts.ts",
    "pages/api/admin-drafts.ts",
    "pages/api/admin-products.ts",
    "components/admin/ProductDraftBar.tsx",
    "lib/productDraftClient.ts",
    "app/sidhu/page.tsx",
    "scripts/phase-multi-150-tests.js",
    "docs/design/DRAFT-PUBLISH.md",
    "scripts/phase-multi-116-tests.js",
    "scripts/phase-multi-130-tests.js",
    "scripts/phase-multi-131-tests.js",
    "scripts/phase-multi-132-tests.js",
    "scripts/phase-multi-142-tests.js",
    "scripts/phase-multi-143-tests.js",
    "scripts/phase-multi-145-tests.js",
    "scripts/phase-multi-146-tests.js",
    "scripts/phase-multi-147-tests.js",
    "scripts/phase-multi-148-tests.js",
    "scripts/phase-multi-149-tests.js",

    // F4UK-MULTI-151: draft bars stable session-expired refs (no reload on parent render).
    "components/admin/CmsDraftBar.tsx",
    "components/admin/ProductDraftBar.tsx",
    "scripts/phase-multi-151-tests.js",
    // F4UK-MULTI-153: UX fix batch B
    "app/cart/page.tsx",
    "components/product/CurrentSeasonalOffers.tsx",
    "components/HeroSlider.tsx",
    "app/faq/FAQClient.tsx",
    "app/blog/BlogClient.tsx",
    "scripts/phase-multi-153-tests.js",
    // F4UK-MULTI-154: hero active-dot hotfix
    "components/HeroSlider.tsx",
    "scripts/phase-multi-154-tests.js",
  ]);
  const diff = spawnSync("git", ["diff", "--name-only", `${BASE}..HEAD`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const unstaged = spawnSync("git", ["diff", "--name-only", BASE], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const status = spawnSync("git", ["status", "--porcelain"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  const names = new Set();
  for (const block of [diff.stdout || "", unstaged.stdout || ""]) {
    for (const line of block.split(/\r?\n/)) {
      const t = line.trim().replace(/\\/g, "/");
      if (t) names.add(t);
    }
  }
  for (const line of (status.stdout || "").split(/\r?\n/)) {
    const t = line.trim();
    if (!t) continue;
    const m = t.match(/^\?\?\s+(.+)$/) || t.match(/^[ MADRCU?]{1,2}\s+(.+)$/);
    if (m) names.add(m[1].replace(/\\/g, "/"));
  }
  const bad = [...names].filter((f) => !allowed.has(f));
  ok(
    "no_forbidden_diff",
    bad.length === 0,
    bad.length ? bad.join(",") : [...names].join(",") || "(clean-or-approved)"
  );
}

runLabelTests();
runCartTests();
runContactTests();
runPdpTests();
runDiffAllowlist();
console.log(`\nphase-multi-147: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
