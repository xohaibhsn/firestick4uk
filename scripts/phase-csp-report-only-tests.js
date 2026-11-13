/**
 * CSP enforcing policy invariants (report-only duplicate removed in ADS-CSP-77).
 */
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

const TESTED_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.googleadservices.com https://www.google.com https://googleads.g.doubleclick.net; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-src 'self' https://www.googletagmanager.com https://td.doubleclick.net https://bid.g.doubleclick.net; object-src 'none'; base-uri 'self'; frame-ancestors 'self'; form-action 'self'; media-src 'self'; manifest-src 'self';";

function ok(name, condition, detail = "") {
  if (condition) {
    passed++;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed++;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(relativePath) {
  return fs.readFileSync(path.join(ROOT, relativePath), "utf8");
}

function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function headerValues(block, headerName) {
  const pattern = new RegExp(
    `\\{\\s*key:\\s*"${escapeRegex(headerName)}"\\s*,\\s*value:\\s*"([^"]*)"\\s*\\}`,
    "g"
  );
  return Array.from(block.matchAll(pattern), (match) => match[1]);
}

function parseDirectives(policy) {
  return new Map(
    policy
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const [name, ...sources] = part.split(/\s+/);
        return [name, sources];
      })
  );
}

function assertCandidateDirectives(prefix, policy) {
  const directives = parseDirectives(policy || "");

  ok(
    `${prefix}_google_script_origins`,
    [
      "https://www.googletagmanager.com",
      "https://www.googleadservices.com",
      "https://www.google.com",
      "https://googleads.g.doubleclick.net",
    ].every((origin) => directives.get("script-src")?.includes(origin))
  );
  ok(
    `${prefix}_no_clarity_script_origin`,
    !directives.get("script-src")?.some((s) => /clarity/i.test(s)) &&
      !/clarity\.ms/i.test(policy || "")
  );
  ok(
    `${prefix}_google_fonts_origins`,
    directives.get("style-src")?.includes("https://fonts.googleapis.com") &&
      directives.get("font-src")?.includes("https://fonts.gstatic.com")
  );
  ok(
    `${prefix}_google_frame_origins`,
    directives.get("frame-src")?.includes("https://www.googletagmanager.com") &&
      directives.get("frame-src")?.includes("https://td.doubleclick.net") &&
      directives.get("frame-src")?.includes("https://bid.g.doubleclick.net")
  );
  ok(
    `${prefix}_object_src_none`,
    directives.get("object-src")?.join(" ") === "'none'"
  );
  ok(
    `${prefix}_base_uri_self`,
    directives.get("base-uri")?.join(" ") === "'self'"
  );
  ok(
    `${prefix}_frame_ancestors_self`,
    directives.get("frame-ancestors")?.join(" ") === "'self'"
  );
  ok(
    `${prefix}_form_action_self`,
    directives.get("form-action")?.join(" ") === "'self'"
  );
  ok(
    `${prefix}_broad_img_https_retained`,
    directives.get("img-src")?.includes("https:")
  );
  ok(
    `${prefix}_broad_connect_https_retained`,
    directives.get("connect-src")?.includes("https:")
  );
  ok(
    `${prefix}_has_no_reporting_endpoint`,
    !directives.has("report-uri") &&
      !directives.has("report-to") &&
      !/key:\s*"Report-To"/i.test(securityBlock) &&
      !/key:\s*"Reporting-Endpoints"/i.test(securityBlock)
  );
  ok(
    `${prefix}_has_no_upgrade_insecure_requests`,
    !directives.has("upgrade-insecure-requests")
  );
}

const nextConfig = read("next.config.ts");
const securityBlockMatch = nextConfig.match(
  /const securityHeaders\s*=\s*\[([\s\S]*?)\];/
);
const securityBlock = securityBlockMatch ? securityBlockMatch[1] : "";

ok("security_headers_block_exists", securityBlock.length > 0);

const enforcingValues = headerValues(
  securityBlock,
  "Content-Security-Policy"
);
const reportOnlyValues = headerValues(
  securityBlock,
  "Content-Security-Policy-Report-Only"
);

ok("one_enforcing_csp_header", enforcingValues.length === 1);
ok("zero_report_only_csp_header", reportOnlyValues.length === 0);
ok("enforcing_csp_equals_tested_candidate", enforcingValues[0] === TESTED_CSP);
ok(
  "report_only_header_absent_from_next_config",
  !/Content-Security-Policy-Report-Only/.test(nextConfig)
);
ok(
  "security_headers_remain_global",
  /source:\s*"\/\(\.\*\)"\s*,\s*headers:\s*securityHeaders/.test(nextConfig)
);

assertCandidateDirectives("enforcing", enforcingValues[0]);

ok(
  "tracking_consent_component_still_gates_gtag",
  /injectGtagScriptOnce/.test(read("components/TrackingConsent.tsx")) &&
    /anyOptionalTrackingGranted/.test(read("components/TrackingConsent.tsx"))
);
ok(
  "tracking_consent_storage_key_unchanged",
  /firestick_tracking_consent_v1/.test(read("lib/trackingConsent.ts"))
);
ok(
  "clarity_loader_removed_from_layout",
  !/MicrosoftClarity/.test(read("app/layout.tsx")) &&
    !fs.existsSync(path.join(ROOT, "components/MicrosoftClarity.tsx")) &&
    !fs.existsSync(path.join(ROOT, "lib/clarityGating.ts"))
);
ok(
  "non_csp_next_config_surface_unchanged_shape",
  /generateEtags:\s*false/.test(nextConfig) &&
    /source:\s*"\/\(\.\*\)"\s*,\s*headers:\s*securityHeaders/.test(nextConfig)
);

console.log(
  `\nphase-csp-report-only: ${passed} passed, ${failed} failed`
);
process.exit(failed ? 1 : 0);
