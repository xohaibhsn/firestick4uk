/**
 * WWW → apex permanent host redirect (next.config redirects).
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

const nextConfig = fs.readFileSync(path.join(ROOT, "next.config.ts"), "utf8");

ok("redirects_fn_present", /async redirects\(\)/.test(nextConfig));
ok(
  "host_condition_www_only",
  /type:\s*["']host["']/.test(nextConfig) &&
    /value:\s*["']www\.firestick4uk\.com["']/.test(nextConfig)
);
ok(
  "destination_apex_path",
  /destination:\s*["']https:\/\/firestick4uk\.com\/:path\*["']/.test(nextConfig)
);
ok("permanent_true", /permanent:\s*true/.test(nextConfig));
ok(
  "source_path_star",
  /source:\s*["']\/:path\*["']/.test(nextConfig)
);
ok(
  "no_apex_host_match",
  !/value:\s*["']firestick4uk\.com["']/.test(nextConfig)
);
ok(
  "headers_rewrites_preserved",
  /async rewrites\(\)/.test(nextConfig) &&
    /async headers\(\)/.test(nextConfig) &&
    /noStoreHeaders/.test(nextConfig) &&
    /securityHeaders/.test(nextConfig)
);
ok(
  "no_middleware_file",
  !fs.existsSync(path.join(ROOT, "middleware.ts")) &&
    !fs.existsSync(path.join(ROOT, "middleware.js"))
);
ok(
  "product_slug_redirects_not_in_next_config",
  !/world-cup-offer-3-years/.test(nextConfig) &&
    !/3-years-season-pass/.test(nextConfig) &&
    !/2-years-subscription/.test(nextConfig)
);

console.log(`\nwww-apex-host-redirect: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
