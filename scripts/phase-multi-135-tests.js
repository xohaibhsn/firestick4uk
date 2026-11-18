/**
 * F4UK-MULTI-135 / BANK-PUBLIC-1 —
 * Hide bank identity values from public site-content when Bank Transfer is
 * effectively disabled. Pure helpers + source assertions. No DB / network.
 * Run: node scripts/phase-multi-135-tests.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const BASE_SHA = "5ec9a911d14200c56cf883b89417469d22096d1e";

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

function deepFreeze(obj) {
  if (obj && typeof obj === "object" && !Object.isFrozen(obj)) {
    Object.freeze(obj);
    for (const k of Object.keys(obj)) deepFreeze(obj[k]);
  }
  return obj;
}

function cloneJson(obj) {
  return JSON.parse(JSON.stringify(obj));
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      resolveJsonModule: true,
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
      const mapped = id.replace("@/", "");
      for (const c of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
        path.join(ROOT, mapped + ".json"),
        path.join(ROOT, mapped),
      ]) {
        if (fs.existsSync(c)) {
          if (c.endsWith(".json")) return require(c);
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = path.normalize(path.join(path.dirname(abs), id));
      for (const c of [
        resolved,
        resolved + ".ts",
        resolved + ".tsx",
        resolved + ".js",
        resolved + ".json",
      ]) {
        if (fs.existsSync(c)) {
          if (c.endsWith(".json")) return require(c);
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}

const filterMod = loadTs("lib/publicSiteContentFilter.ts");
const {
  BANK_IDENTITY_PUBLIC_KEYS,
  PUBLIC_SITE_CONTENT_CRITICAL_KEYS,
  PUBLIC_SITE_CONTENT_DENYLIST,
  filterPublicSiteContentMap,
  redactBankIdentityWhenBankDisabled,
} = filterMod;

ok(
  "exports_bank_identity_keys",
  Array.isArray(BANK_IDENTITY_PUBLIC_KEYS) &&
    BANK_IDENTITY_PUBLIC_KEYS.join(",") ===
      "bank_account_name,bank_sort_code,bank_account_no"
);
ok(
  "exports_redact_helper",
  typeof redactBankIdentityWhenBankDisabled === "function"
);
ok(
  "exports_filter_unchanged_signature",
  typeof filterPublicSiteContentMap === "function"
);

const DUMMY = {
  bank_account_name: "TEST NAME",
  bank_sort_code: "00-00-00",
  bank_account_no: "00000000",
};

function baseMap(overrides = {}) {
  return {
    prices_include_vat: "1",
    price_incl_vat_suffix: "incl. VAT",
    bank_account_name: DUMMY.bank_account_name,
    bank_sort_code: DUMMY.bank_sort_code,
    bank_account_no: DUMMY.bank_account_no,
    bank_heading: "Pay by bank",
    bank_reference_value: "ORDER-REF",
    payment_bank_enabled: "1",
    payment_cod_enabled: "1",
    contact_email: "a@b.c",
    other_key: "keep",
    ...overrides,
  };
}

function assertIdentityBlank(out, label) {
  for (const k of BANK_IDENTITY_PUBLIC_KEYS) {
    ok(
      `${label}_${k}_present`,
      Object.prototype.hasOwnProperty.call(out, k)
    );
    ok(`${label}_${k}_blank`, out[k] === "");
  }
}

function assertIdentityUnchanged(out, input, label) {
  for (const k of BANK_IDENTITY_PUBLIC_KEYS) {
    ok(`${label}_${k}_unchanged`, out[k] === input[k]);
  }
}

function assertOtherKeysEqual(out, input, label) {
  const skip = new Set(BANK_IDENTITY_PUBLIC_KEYS);
  const keysA = Object.keys(input).filter((k) => !skip.has(k)).sort();
  const keysB = Object.keys(out).filter((k) => !skip.has(k)).sort();
  ok(
    `${label}_other_keys_same`,
    keysA.join(",") === keysB.join(",") &&
      keysA.every((k) => deepEqual(input[k], out[k]))
  );
}

function assertNotMutated(input, snapshot, label) {
  ok(`${label}_input_not_mutated`, deepEqual(input, snapshot));
}

// --- Truth table for redactBankIdentityWhenBankDisabled ---
{
  const cases = [
    {
      name: "bank0_cod1_redacted",
      overrides: { payment_bank_enabled: "0", payment_cod_enabled: "1" },
      expectRedact: true,
    },
    {
      name: "bank1_unchanged",
      overrides: { payment_bank_enabled: "1", payment_cod_enabled: "1" },
      expectRedact: false,
    },
    {
      name: "bank_absent_unchanged",
      overrides: { payment_cod_enabled: "1" },
      dropBank: true,
      expectRedact: false,
    },
    {
      name: "bank_garbage_unchanged",
      overrides: { payment_bank_enabled: "maybe", payment_cod_enabled: "1" },
      expectRedact: false,
    },
    {
      name: "both_off_corrected_unchanged",
      overrides: { payment_bank_enabled: "0", payment_cod_enabled: "0" },
      expectRedact: false,
    },
    {
      name: "bank_false_redacted",
      overrides: { payment_bank_enabled: "false", payment_cod_enabled: "1" },
      expectRedact: true,
    },
    {
      name: "bank_off_redacted",
      overrides: { payment_bank_enabled: "off", payment_cod_enabled: "1" },
      expectRedact: true,
    },
    {
      name: "bank_no_redacted",
      overrides: { payment_bank_enabled: "no", payment_cod_enabled: "1" },
      expectRedact: true,
    },
  ];

  for (const c of cases) {
    const input = baseMap(c.overrides);
    if (c.dropBank) delete input.payment_bank_enabled;
    const snapshot = cloneJson(input);
    deepFreeze(cloneJson(input)); // freeze a twin; keep input mutable for Object.freeze check below
    const frozen = deepFreeze(cloneJson(input));
    const outFromFrozen = redactBankIdentityWhenBankDisabled(frozen);
    const out = redactBankIdentityWhenBankDisabled(input);
    assertNotMutated(input, snapshot, c.name);
    ok(
      `${c.name}_frozen_input_survives`,
      deepEqual(frozen, snapshot)
    );
    if (c.expectRedact) {
      assertIdentityBlank(out, c.name);
      assertIdentityBlank(outFromFrozen, `${c.name}_frozen`);
      ok(`${c.name}_returns_copy`, out !== input);
    } else {
      assertIdentityUnchanged(out, input, c.name);
      ok(
        `${c.name}_returns_same_ref_when_enabled`,
        out === input || deepEqual(out, input)
      );
    }
    assertOtherKeysEqual(out, input, c.name);
  }
}

// Absent identity keys are not added
{
  const input = baseMap({
    payment_bank_enabled: "0",
    payment_cod_enabled: "1",
  });
  delete input.bank_sort_code;
  const snapshot = cloneJson(input);
  const out = redactBankIdentityWhenBankDisabled(input);
  ok(
    "absent_sort_code_not_added",
    !Object.prototype.hasOwnProperty.call(out, "bank_sort_code")
  );
  ok("absent_name_still_blanked", out.bank_account_name === "");
  ok("absent_no_still_blanked", out.bank_account_no === "");
  assertNotMutated(input, snapshot, "absent_keys");
}

// filterPublicSiteContentMap: denylist + redaction when bank OFF
{
  const denylistJson = JSON.parse(read("lib/publicSiteContentDenylist.json"));
  const denyKey = denylistJson[0] || "clarity_project_id";
  const input = baseMap({
    payment_bank_enabled: "0",
    payment_cod_enabled: "1",
    [denyKey]: "SECRET",
  });
  const snapshot = cloneJson(input);
  const filtered = filterPublicSiteContentMap(input);
  ok(
    "filter_removes_denylist_when_bank_off",
    !Object.prototype.hasOwnProperty.call(filtered, denyKey)
  );
  assertIdentityBlank(filtered, "filter_bank_off");
  ok(
    "filter_keeps_heading_and_ref",
    filtered.bank_heading === "Pay by bank" &&
      filtered.bank_reference_value === "ORDER-REF"
  );
  ok(
    "filter_keeps_toggles",
    filtered.payment_bank_enabled === "0" &&
      filtered.payment_cod_enabled === "1"
  );
  assertNotMutated(input, snapshot, "filter_bank_off");
}

// filter when bank ON: identity unchanged, denylist still removed
{
  const denylistJson = JSON.parse(read("lib/publicSiteContentDenylist.json"));
  const denyKey = denylistJson[0] || "clarity_project_id";
  const input = baseMap({
    payment_bank_enabled: "1",
    payment_cod_enabled: "1",
    [denyKey]: "SECRET",
  });
  const snapshot = cloneJson(input);
  const filtered = filterPublicSiteContentMap(input);
  ok(
    "filter_removes_denylist_when_bank_on",
    !Object.prototype.hasOwnProperty.call(filtered, denyKey)
  );
  assertIdentityUnchanged(filtered, input, "filter_bank_on");
  assertNotMutated(input, snapshot, "filter_bank_on");
}

// Critical keys still present after filtering when present in input
{
  const input = {};
  for (const k of PUBLIC_SITE_CONTENT_CRITICAL_KEYS) {
    input[k] = k.startsWith("bank_account") || k === "bank_sort_code"
      ? DUMMY[k] || "x"
      : "1";
  }
  input.payment_bank_enabled = "0";
  input.payment_cod_enabled = "1";
  const filtered = filterPublicSiteContentMap(input);
  ok(
    "critical_keys_present_after_filter_bank_off",
    PUBLIC_SITE_CONTENT_CRITICAL_KEYS.every((k) =>
      Object.prototype.hasOwnProperty.call(filtered, k)
    )
  );
  ok(
    "critical_bank_identity_blank_but_present",
    filtered.bank_account_name === "" &&
      filtered.bank_sort_code === "" &&
      filtered.bank_account_no === ""
  );
}

// Source assertions: pages/api/site-content.ts unchanged vs BASE_SHA
{
  const diffApi = spawnSync(
    "git",
    ["diff", "--name-only", BASE_SHA, "HEAD", "--", "pages/api"],
    { cwd: ROOT, encoding: "utf8" }
  );
  const workingApi = spawnSync(
    "git",
    ["diff", "--name-only", "HEAD", "--", "pages/api"],
    { cwd: ROOT, encoding: "utf8" }
  );
  const untrackedApi = spawnSync(
    "git",
    ["ls-files", "--others", "--exclude-standard", "--", "pages/api"],
    { cwd: ROOT, encoding: "utf8" }
  );
  const MULTI137_API_OK = new Set([
    "pages/api/coupons.ts",
    "pages/api/faqs.ts",
    "pages/api/admin-reviews.ts",
  ]);
  // F4UK-MULTI-139: atomic staff password + SEO reconcile lock.
  const MULTI139_API_OK = new Set([
    "pages/api/admin-profile.ts",
    "pages/api/admin-staff-password.ts",
    "pages/api/admin-seo-issues/reconcile.ts",
  ]);
  const apiNames = [
    ...(diffApi.stdout || "").split(/\r?\n/),
    ...(workingApi.stdout || "").split(/\r?\n/),
    ...(untrackedApi.stdout || "").split(/\r?\n/),
  ]
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean)
    .filter((n) => !MULTI137_API_OK.has(n) && !MULTI139_API_OK.has(n));
  ok("zero_pages_api_diff", apiNames.length === 0, apiNames.join(",") || "clean");

  const siteContentSrc = read("pages/api/site-content.ts");
  ok(
    "admin_scope_unfiltered",
    /scopeAdmin[\s\S]*loadSiteContentAllUncached\(\)[\s\S]*return res\.status\(200\)\.json\(result\)/.test(
      siteContentSrc
    ) &&
      /getCachedPublicSiteContentAll\(\)[\s\S]*filterPublicSiteContentMap\(result\)/.test(
        siteContentSrc
      )
  );

  const NOT_APPROVED = [
    "lib/paymentMethodSettings.ts",
    "lib/publicSiteContentServer.ts",
    "lib/publicSiteContentDenylist.json",
    "lib/siteContentDefaults.ts",
    "scripts/live-health-check.js",
  ];
  const badNotApproved = [];
  for (const f of NOT_APPROVED) {
    const d = spawnSync("git", ["diff", "--name-only", BASE_SHA, "--", f], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const w = spawnSync("git", ["diff", "--name-only", "HEAD", "--", f], {
      cwd: ROOT,
      encoding: "utf8",
    });
    const names = `${d.stdout || ""}\n${w.stdout || ""}`
      .split(/\r?\n/)
      .map((s) => s.trim())
      .filter(Boolean);
    if (names.length) badNotApproved.push(f);
  }
  ok(
    "zero_diff_not_approved_list",
    badNotApproved.length === 0,
    badNotApproved.join(",") || "clean"
  );

  // Fixtures use dummy values only
  const testSrc = read("scripts/phase-multi-135-tests.js");
  ok(
    "fixtures_use_dummy_bank_values",
    /TEST NAME/.test(testSrc) &&
      /00-00-00/.test(testSrc) &&
      /00000000/.test(testSrc)
  );
  ok(
    "no_real_looking_sort_in_fixtures_beyond_dummy",
    !/"\d{2}-\d{2}-\d{2}"/.test(testSrc.replace(/"00-00-00"/g, '""'))
  );
}

// Denylist set still wired
ok(
  "denylist_set_present",
  PUBLIC_SITE_CONTENT_DENYLIST instanceof Set &&
    PUBLIC_SITE_CONTENT_DENYLIST.size > 0
);

console.log(`\nMULTI-135 results: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
