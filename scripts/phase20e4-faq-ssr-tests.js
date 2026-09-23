/**
 * Phase 20E.4 — FAQ server-rendered content + FAQPage JSON-LD.
 */
const fs = require("fs");
const path = require("path");

const ROOT = process.cwd();

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

function mark(id, ok, detail = "") {
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  return ok;
}

let failed = 0;
const fail = (id, ok, detail) => {
  if (!mark(id, ok, detail)) failed += 1;
};

const page = read("app/faq/page.tsx");
const client = read("app/faq/FAQClient.tsx");
const helper = read("lib/publicFaqsServer.ts");
const api = read("pages/api/faqs.ts");
const layout = read("app/faq/layout.tsx");
const homePage = read("app/page.tsx");
const productsPage = read("app/products/page.tsx");
const blogPage = read("app/blog/page.tsx");

fail(
  "F1_faq_page_not_use_client",
  !page.includes('"use client"') && !page.includes("'use client'")
);

fail(
  "F2_server_uses_public_helper",
  /getPublicVisibleFaqs/.test(page) &&
    /from\s+["']@\/lib\/publicFaqsServer["']/.test(page) &&
    /FAQClient/.test(page)
);

fail(
  "F3_client_accepts_initialFaqs",
  /"use client"/.test(client) &&
    /initialFaqs/.test(client) &&
    /useState<FaqItem\[\]>\(initialFaqs\)/.test(client)
);

fail(
  "F4_loading_avoids_flash",
  /useState\(initialFaqs\.length === 0\)/.test(client)
);

fail(
  "F5_helper_visible_only",
  /is_visible\s*=\s*1/.test(helper) &&
    /ORDER BY\s+category,\s*sort_order\s+ASC/i.test(helper)
);

fail(
  "F6_helper_no_hidden",
  !/is_visible\s*=\s*0/.test(helper) &&
    /WHERE\s+is_visible\s*=\s*1/i.test(helper)
);

fail(
  "F7_no_mount_refetch_when_ssr",
  /if \(initialFaqs\.length > 0\) return/.test(client) &&
    /fetch\(["']\/api\/faqs["']\)/.test(client)
);

fail(
  "F8_answers_rendered_in_dom",
  /faq-answer-text/.test(client) &&
    /\{faq\.answer\}/.test(client) &&
    /\{faq\.question\}/.test(client)
);

fail(
  "F9_jsonld_from_initial",
  /FAQPage/.test(page) &&
    /JsonLd/.test(page) &&
    /initialFaqs\.map/.test(page) &&
    !/FAQPage/.test(client)
);

fail(
  "F10_no_hardcoded_faq_content",
  !/What is a Firestick subscription\?/.test(page) &&
    !/What is a Firestick subscription\?/.test(helper)
);

fail(
  "F11_api_faqs_intact",
  exists("pages/api/faqs.ts") &&
    /faqs\.manage/.test(api) &&
    /is_visible=1/.test(api)
);

fail(
  "F12_metadata_canonical_intact",
  /canonical:\s*"https:\/\/firestick4uk\.com\/faq"/.test(layout) &&
    /url:\s*"https:\/\/firestick4uk\.com\/faq"/.test(layout)
);

fail(
  "F13_no_home_ssr_change",
  /getPublicActiveProducts/.test(homePage) &&
    /initialProducts/.test(homePage)
);

fail(
  "F14_no_products_ssr_change",
  /getPublicActiveProducts/.test(productsPage)
);

fail(
  "F15_no_blog_ssr_change",
  /getPublicPublishedPosts/.test(blogPage)
);

fail(
  "F16_helper_empty_on_error",
  /catch\s*\{[\s\S]*return\s*\[\]/.test(helper)
);

fail(
  "F17_files_exist",
  exists("lib/publicFaqsServer.ts") && exists("app/faq/FAQClient.tsx")
);

fail(
  "F18_breadcrumb_server",
  /BreadcrumbSchema/.test(page)
);

console.log("");
if (failed > 0) {
  console.log(`FAILED: ${failed} check(s)`);
  process.exit(1);
}
console.log("ALL Phase20E.4 FAQ SSR checks PASSED");
