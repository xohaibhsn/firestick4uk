/**
 * F4UK-SEO-SMALL-86 — /admin permanent redirect (308) to home.
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
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

const adminPage = read("app/admin/page.tsx");
const nextConfig = read("next.config.ts");

ok("admin_page_exists", fs.existsSync(path.join(ROOT, "app/admin/page.tsx")));
ok(
  "admin_imports_permanentRedirect",
  /import\s*\{\s*permanentRedirect\s*\}\s*from\s*["']next\/navigation["']/.test(adminPage)
);
ok(
  "admin_calls_permanentRedirect_home",
  /permanentRedirect\s*\(\s*["']\/["']\s*\)/.test(adminPage)
);
ok(
  "admin_no_temporary_redirect_call",
  !/\bredirect\s*\(/.test(adminPage)
);
ok("admin_destination_is_home", /permanentRedirect\s*\(\s*["']\/["']\s*\)/.test(adminPage));
ok("admin_not_to_sidhu", !/sidhu/.test(adminPage));
ok(
  "admin_not_client_redirect",
  !/"use client"/.test(adminPage) && !/window\.location/.test(adminPage)
);
ok(
  "next_config_has_no_admin_redirect_override",
  !/source:\s*["']\/admin/.test(nextConfig)
);

console.log(`\nseo-small-86: ${passed} PASS, ${failed} FAIL`);
process.exit(failed ? 1 : 0);
