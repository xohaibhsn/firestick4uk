/**
 * F4UK-MULTI-146 — UX-BATCH-1: /products H1 no duplicate + checkout optional tags.
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
const BASE = "d90a101f0a6b4dc2e3402fa1652150a7f9bfe6b3";

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
      jsx: ts.JsxEmit.React,
    },
    fileName: abs,
  }).outputText;
  const m = new Module(abs, module);
  m.filename = abs;
  m.paths = Module._nodeModulePaths(path.dirname(abs));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith("@/")) {
      const mapped = id.slice(2);
      for (const candidate of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(candidate)) {
          return loadTs(path.relative(ROOT, candidate).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

function extractBlock(src, startRe, endRe) {
  const start = src.search(startRe);
  if (start < 0) return null;
  const from = src.slice(start);
  const end = from.search(endRe);
  if (end < 0) return from;
  return from.slice(0, end);
}

// ─── splitProductsTitle ─────────────────────────────────────────────────────

function runSplitTests() {
  console.log("\n# splitProductsTitle");
  const { splitProductsTitle } = loadTs("lib/productsPageTitle.ts");

  const cases = [
    ["All", "All", "Products"],
    ["All Products", "All", "Products"],
    ["Our Products", "Our", "Products"],
    ["Shop", "Shop", "Products"],
    ["products", "", "products"],
    ["  All   Products  ", "All", "Products"],
    ["ALL PRODUCTS", "ALL", "PRODUCTS"],
    ["Products Products", "Products", "Products"],
    ["", "All", "Products"],
    [null, "All", "Products"],
    [undefined, "All", "Products"],
    [42, "All", "Products"],
    ["Products", "", "Products"],
  ];
  for (const [raw, lead, tail] of cases) {
    const r = splitProductsTitle(raw);
    ok(
      `split_${JSON.stringify(raw)}`,
      r.lead === lead && r.tail === tail,
      `got lead=${JSON.stringify(r.lead)} tail=${JSON.stringify(r.tail)}`
    );
  }
  ok("split_never_throws_object", (() => {
    try {
      const r = splitProductsTitle({ x: 1 });
      return r.lead === "All" && r.tail === "Products";
    } catch {
      return false;
    }
  })());
}

// ─── ProductsClient source ──────────────────────────────────────────────────

function runProductsClientTests() {
  console.log("\n# ProductsClient");
  const src = read("app/products/ProductsClient.tsx");
  const base = gitShow(BASE, "app/products/ProductsClient.tsx");

  ok("uses_splitProductsTitle", /splitProductsTitle/.test(src));
  ok(
    "import_productsPageTitle",
    /import\s+\{\s*splitProductsTitle\s*\}\s+from\s+["']@\/lib\/productsPageTitle["']/.test(src)
  );
  ok(
    "products_title_fallback_All",
    /t\(\s*["']products_title["']\s*,\s*["']All["']\s*\)/.test(src)
  );
  ok(
    "h1_uses_lead_tail_span",
    /page-title[\s\S]*?productsTitleLead[\s\S]*?<span>\{productsTitleTail\}<\/span>/.test(src) &&
      /productsTitleLead \? productsTitleLead : null\}\{productsTitleLead \? " " : ""\}<span>\{productsTitleTail\}<\/span>/.test(
        src
      )
  );
  ok(
    "no_hardcoded_Products_append",
    !/\{\s*t\(\s*["']products_title["'][\s\S]*?\}\s*<span>Products<\/span>/.test(src)
  );

  // Diff limited to import + H1 area (numstat / line budget)
  const diff = spawnSync(
    "git",
    ["diff", "--numstat", BASE, "--", "app/products/ProductsClient.tsx"],
    { cwd: ROOT, encoding: "utf8" }
  );
  const line = (diff.stdout || "").trim().split(/\r?\n/)[0] || "";
  const parts = line.split(/\s+/);
  const added = Number(parts[0] || 0);
  const deleted = Number(parts[1] || 0);
  ok(
    "productsClient_diff_small",
    added <= 12 && deleted <= 4,
    `numstat +${added}/-${deleted}`
  );

  // Raw HTML H1 equivalence for fallback "All"
  // Old: `{t("products_title", "All")} <span>Products</span>` → "All <span>Products</span>"
  // New: lead="All" → `{lead} ` + `<span>{tail}</span>` → same
  const { splitProductsTitle } = loadTs("lib/productsPageTitle.ts");
  const { lead, tail } = splitProductsTitle("All");
  const oldHtml = `All <span>Products</span>`;
  const newHtml = `${lead ? `${lead} ` : ""}<span>${tail}</span>`;
  ok("raw_html_h1_fallback_All_identical", oldHtml === newHtml, `new=${newHtml}`);

  const { lead: leadCms, tail: tailCms } = splitProductsTitle("All Products");
  const cmsHtml = `${leadCms ? `${leadCms} ` : ""}<span>${tailCms}</span>`;
  ok(
    "cms_All_Products_no_duplicate",
    cmsHtml === oldHtml && !/All Products Products/.test(cmsHtml)
  );

  ok(
    "base_had_duplicate_pattern",
    /t\(\s*["']products_title["']\s*,\s*["']All["']\s*\)\}\s*<span>Products<\/span>/.test(base)
  );
}

// ─── cart/page.tsx ──────────────────────────────────────────────────────────

function runCartTests() {
  console.log("\n# cart/page.tsx");
  const src = read("app/cart/page.tsx");
  const base = gitShow(BASE, "app/cart/page.tsx");

  // Required: email + phone keep req-star
  const emailStar = /key === ["']email["'][\s\S]*?req-star[\s\S]*?\*/;
  ok("email_req_star_present", /isEmail && <span className="req-star"/.test(src));
  ok(
    "phone_req_star_present",
    /cart_lbl_phone[\s\S]{0,120}<span className="req-star" aria-hidden="true">\*<\/span>/.test(src)
  );

  // Optional fields get opt-tag
  const optionalKeys = [
    { name: "name", re: /key:"name"[\s\S]*?!isEmail && !labelHasOptional\(f\.label\) && <span className="opt-tag">/ },
    {
      name: "address",
      re: /!isEmail && !labelHasOptional\(f\.label\) && <span className="opt-tag"> \(\{t\(["']cart_optional_tag["'],\s*["']optional["']\)\}\)<\/span>/,
    },
    {
      name: "city",
      re: /checkout-city[\s\S]{0,200}!labelHasOptional[\s\S]{0,200}opt-tag[\s\S]{0,80}cart_optional_tag/,
    },
    {
      name: "postcode",
      re: /checkout-postcode[\s\S]{0,200}!labelHasOptional[\s\S]{0,200}opt-tag[\s\S]{0,80}cart_optional_tag/,
    },
    {
      name: "notes",
      re: /checkout-notes[\s\S]{0,400}!labelHasOptional[\s\S]{0,200}opt-tag[\s\S]{0,80}cart_optional_tag/,
    },
  ];
  for (const { name, re } of optionalKeys) {
    ok(`opt_tag_${name}`, re.test(src));
  }

  // Email/phone must NOT have opt-tag on their labels
  ok(
    "email_no_opt_tag",
    !/\{isEmail && <span className="opt-tag">/.test(src) &&
      /\{isEmail && <span className="req-star"/.test(src)
  );
  const phoneLabelBlock = src.match(
    /cart_lbl_phone["'],\s*["']WhatsApp \/ Phone["']\)[\s\S]{0,200}/
  );
  ok(
    "phone_no_opt_tag",
    phoneLabelBlock &&
      /req-star/.test(phoneLabelBlock[0]) &&
      !/opt-tag/.test(phoneLabelBlock[0])
  );

  // req-star markup unchanged vs base (count + exact snippets)
  const starRe = /<span className="req-star" aria-hidden="true">\*<\/span>/g;
  const baseStars = (base.match(starRe) || []).length;
  const nowStars = (src.match(starRe) || []).length;
  ok("req_star_count_unchanged", baseStars === nowStars && nowStars === 2, `base=${baseStars} now=${nowStars}`);

  // Validation blocks byte-identical
  function hashValidateRegion(text) {
    // From validateCheckoutContact usage in submit through setFieldErrors({}) after contact gate
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

  // Broader: the import + validateCheckoutContact call sites count
  ok(
    "validateCheckoutContact_call_count",
    (base.match(/validateCheckoutContact\(/g) || []).length ===
      (src.match(/validateCheckoutContact\(/g) || []).length
  );

  // Input name / autoComplete attributes for checkout fields unchanged
  const attrSnippets = [
    'key:"name", type:"text", placeholder:"John Smith", name:"name", autoComplete:"name"',
    'key:"email", type:"email", placeholder:"john@example.com", name:"email", autoComplete:"email"',
    'key:"address", type:"text", placeholder:"123 High Street", name:"street-address", autoComplete:"street-address"',
    'name="tel"',
    'autoComplete="tel-national"',
    'name="address-level2"',
    'autoComplete="address-level2"',
    'name="postal-code"',
    'autoComplete="postal-code"',
    'name="order-notes"',
  ];
  for (const a of attrSnippets) {
    ok(`attrs_${a.slice(0, 40)}`, src.includes(a) && base.includes(a));
  }

  ok("css_opt_tag_rule", /\.form-group\s+\.opt-tag\s*\{[^}]*font-size:\s*0\.8em/.test(src));
  ok("css_req_star_untouched", /\.form-group\s+\.req-star\s*\{\s*color:#B91C1C;\s*margin-left:3px;\s*\}/.test(src));
}

// ─── adminContentFields ─────────────────────────────────────────────────────

function runAdminFieldsTests() {
  console.log("\n# adminContentFields");
  const src = read("lib/adminContentFields.ts");
  const base = gitShow(BASE, "lib/adminContentFields.ts");

  const optMatches = src.match(/key:\s*["']cart_optional_tag["']/g) || [];
  ok("cart_optional_tag_once", optMatches.length === 1);
  ok(
    "cart_optional_tag_meta",
    /key:\s*["']cart_optional_tag["'][\s\S]{0,200}label:\s*["']Optional field tag["'][\s\S]{0,200}help:\s*["']Small text after optional checkout fields["']/.test(
      src
    )
  );
  ok(
    "products_title_help_updated",
    /key:\s*["']products_title["'][\s\S]{0,120}help:\s*'Main heading on \/products\. "All" or "All Products" both show as "All Products"\.'/.test(
      src
    )
  );

  // All other entries unchanged: strip the two intentional edits and compare hashes
  function normalizeForRest(text) {
    return text
      .replace(
        /help:\s*"Main heading on \/products\."/,
        "HELP_PRODUCTS_PLACEHOLDER"
      )
      .replace(
        /help:\s*'Main heading on \/products\. "All" or "All Products" both show as "All Products"\.'/,
        "HELP_PRODUCTS_PLACEHOLDER"
      )
      .replace(
        /\r?\n\s*\{\s*\r?\n\s*key:\s*["']cart_optional_tag["'][\s\S]*?help:\s*["']Small text after optional checkout fields["'],?\s*\r?\n\s*\},?/,
        ""
      );
  }
  const nb = normalizeForRest(base);
  const nn = normalizeForRest(src);
  ok(
    "admin_fields_rest_unchanged",
    sha256(nb) === sha256(nn),
    `base=${sha256(nb).slice(0, 12)} now=${sha256(nn).slice(0, 12)}`
  );

  const keyCount = (t) => (t.match(/key:\s*["'][^"']+["']/g) || []).length;
  ok(
    "admin_fields_key_count_plus_one",
    keyCount(src) === keyCount(base) + 1,
    `base=${keyCount(base)} now=${keyCount(src)}`
  );
}

// ─── CSS only .opt-tag added (in cart page styles) ──────────────────────────

function runCssTests() {
  console.log("\n# CSS");
  const src = read("app/cart/page.tsx");
  const base = gitShow(BASE, "app/cart/page.tsx");
  const styleNow = (src.match(/\.form-group \.req-star[\s\S]*?\.field-error/) || [""])[0];
  const styleBase = (base.match(/\.form-group \.req-star[\s\S]*?\.field-error/) || [""])[0];
  ok("css_added_opt_tag_only", /\.opt-tag/.test(styleNow) && !/\.opt-tag/.test(styleBase));
  // globals untouched
  const gDiff = spawnSync("git", ["diff", "--name-only", BASE, "--", "app/globals.css"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  ok("globals_css_untouched", !(gDiff.stdout || "").trim());
}

// ─── no-forbidden-diff ──────────────────────────────────────────────────────

function runDiffAllowlist() {
  console.log("\n# no-forbidden-diff");
  const allowed = new Set([
    "app/products/ProductsClient.tsx",
    "lib/productsPageTitle.ts",
    "app/cart/page.tsx",
    "lib/adminContentFields.ts",
    "scripts/phase-multi-146-tests.js",
    // Coupled allowlist plumbing only
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

    // F4UK-MULTI-147: optional-tag dedupe, contact phone hint, PDP sticky ATC tuck.
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

runSplitTests();
runProductsClientTests();
runCartTests();
runAdminFieldsTests();
runCssTests();
runDiffAllowlist();
console.log(`\nphase-multi-146: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
