/**
 * Phase 20E.2 — Self-canonicals on order-tracking + legal pages.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function mark(id, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  return ok;
}

let failed = 0;
const fail = (id, ok, detail) => {
  if (!mark(id, ok, detail)) failed += 1;
};

const routes = [
  {
    id: "order-tracking",
    file: "app/order-tracking/layout.tsx",
    canonical: "https://firestick4uk.com/order-tracking",
    ogUrl: "https://firestick4uk.com/order-tracking",
  },
  {
    id: "terms",
    file: "app/terms/layout.tsx",
    canonical: "https://firestick4uk.com/terms",
    ogUrl: "https://firestick4uk.com/terms",
  },
  {
    id: "privacy-policy",
    file: "app/privacy-policy/layout.tsx",
    canonical: "https://firestick4uk.com/privacy-policy",
    ogUrl: "https://firestick4uk.com/privacy-policy",
  },
  {
    id: "refund-policy",
    file: "app/refund-policy/layout.tsx",
    canonical: "https://firestick4uk.com/refund-policy",
    ogUrl: "https://firestick4uk.com/refund-policy",
  },
];

for (const r of routes) {
  const src = read(r.file);

  fail(
    `${r.id}_self_canonical`,
    new RegExp(
      `alternates:\\s*\\{\\s*canonical:\\s*"${r.canonical.replace(
        /[.*+?^${}()|[\]\\]/g,
        "\\$&"
      )}"\\s*\\}`
    ).test(src),
    r.canonical
  );

  fail(
    `${r.id}_not_homepage_canonical`,
    !/alternates:\s*\{\s*canonical:\s*"https:\/\/firestick4uk\.com"\s*\}/.test(
      src
    )
  );

  fail(
    `${r.id}_og_url_preserved`,
    src.includes(`url: "${r.ogUrl}"`)
  );

  fail(
    `${r.id}_cms_og_helper`,
    /getDefaultOgImageFromSettings/.test(src) &&
      /defaultSocialImages/.test(src)
  );
}

const root = read("app/layout.tsx");
fail(
  "root_canonical_untouched",
  /alternates:\s*\{\s*canonical:\s*"https:\/\/firestick4uk\.com"\s*,?\s*\}/.test(
    root
  ) ||
    /canonical:\s*"https:\/\/firestick4uk\.com"/.test(root)
);

const productsLayout = read("app/products/layout.tsx");
const blogLayout = read("app/blog/layout.tsx");
fail(
  "products_metadata_untouched_by_this_phase",
  /canonical:\s*"https:\/\/firestick4uk\.com\/products"/.test(productsLayout)
);
fail(
  "blog_metadata_untouched_by_this_phase",
  /canonical:\s*"https:\/\/firestick4uk\.com\/blog"/.test(blogLayout)
);

// Subscription layout if present
const subLayoutPath = path.join(ROOT, "app/iptv-subscriptions-uk/layout.tsx");
if (fs.existsSync(subLayoutPath)) {
  const sub = fs.readFileSync(subLayoutPath, "utf8");
  fail(
    "subscription_layout_untouched",
    /getDefaultOgImageFromSettings/.test(sub) ||
      /canonical/.test(sub) ||
      sub.length > 0
  );
}

fail(
  "no_homepage_canonical_on_four",
  routes.every((r) => {
    const src = read(r.file);
    const m = src.match(/alternates:\s*\{\s*canonical:\s*"([^"]+)"\s*\}/);
    return m && m[1] === r.canonical && m[1] !== "https://firestick4uk.com";
  })
);

console.log("");
if (failed > 0) {
  console.log(`FAILED: ${failed} check(s)`);
  process.exit(1);
}
console.log("ALL Phase20E.2 self-canonical checks PASSED");
