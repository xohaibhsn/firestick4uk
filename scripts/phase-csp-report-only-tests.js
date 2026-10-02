/**
 * CSP report-only candidate — focused source and scope invariants.
 */
const { execFileSync } = require("child_process");
const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

const ENFORCING_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:;";
const REPORT_ONLY_CSP =
  "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https://www.googletagmanager.com https://www.googleadservices.com https://www.google.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data: blob: https:; connect-src 'self' https:; frame-src 'self' https://www.googletagmanager.com; object-src 'none'; base-uri 'self'; frame-ancestors 'none'; form-action 'self'; media-src 'self'; manifest-src 'self';";

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

function unchangedFromHead(relativePath) {
  const committed = execFileSync("git", ["show", `HEAD:${relativePath}`], {
    cwd: ROOT,
    encoding: "utf8",
  });
  return read(relativePath) === committed;
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
ok("enforcing_csp_exactly_unchanged", enforcingValues[0] === ENFORCING_CSP);
ok("one_report_only_csp_header", reportOnlyValues.length === 1);
ok("report_only_csp_exact_candidate", reportOnlyValues[0] === REPORT_ONLY_CSP);
ok(
  "security_headers_remain_global",
  /source:\s*"\/\(\.\*\)"\s*,\s*headers:\s*securityHeaders/.test(nextConfig)
);

const directives = parseDirectives(reportOnlyValues[0] || "");

ok(
  "report_only_google_script_origins",
  [
    "https://www.googletagmanager.com",
    "https://www.googleadservices.com",
    "https://www.google.com",
  ].every((origin) => directives.get("script-src")?.includes(origin))
);
ok(
  "report_only_google_fonts_origins",
  directives.get("style-src")?.includes("https://fonts.googleapis.com") &&
    directives.get("font-src")?.includes("https://fonts.gstatic.com")
);
ok(
  "report_only_google_frame_origin",
  directives.get("frame-src")?.includes("https://www.googletagmanager.com")
);
ok(
  "report_only_object_src_none",
  directives.get("object-src")?.join(" ") === "'none'"
);
ok(
  "report_only_base_uri_self",
  directives.get("base-uri")?.join(" ") === "'self'"
);
ok(
  "report_only_frame_ancestors_none",
  directives.get("frame-ancestors")?.join(" ") === "'none'"
);
ok(
  "report_only_form_action_self",
  directives.get("form-action")?.join(" ") === "'self'"
);
ok(
  "report_only_broad_img_https_retained",
  directives.get("img-src")?.includes("https:")
);
ok(
  "report_only_broad_connect_https_retained",
  directives.get("connect-src")?.includes("https:")
);
ok(
  "report_only_has_no_reporting_endpoint",
  !directives.has("report-uri") &&
    !directives.has("report-to") &&
    !/key:\s*"Report-To"/i.test(securityBlock) &&
    !/key:\s*"Reporting-Endpoints"/i.test(securityBlock)
);
ok(
  "report_only_has_no_upgrade_insecure_requests",
  !directives.has("upgrade-insecure-requests")
);

ok(
  "tracking_component_unchanged_from_head",
  unchangedFromHead("components/TrackingConsent.tsx")
);
ok(
  "tracking_consent_library_unchanged_from_head",
  unchangedFromHead("lib/trackingConsent.ts")
);

console.log(
  `\nphase-csp-report-only: ${passed} passed, ${failed} failed`
);
process.exit(failed ? 1 : 0);
