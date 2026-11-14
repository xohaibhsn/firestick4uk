/**
 * F4UK-MULTI-94 — right-most public XFF client IP, unified audit IP,
 * rate-limit store cap. Stub DB / no network.
 * Run: node scripts/phase-multi-94-tests.js
 */
"use strict";

const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

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

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const key = abs + "::" + Object.keys(stubs).sort().join(",") + "::" + Math.random();
  const src = fs.readFileSync(abs, "utf8");
  const out = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
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
      const mapped = id.replace("@/", "");
      for (const c of [
        path.join(ROOT, mapped + ".ts"),
        path.join(ROOT, mapped + ".tsx"),
        path.join(ROOT, mapped + ".js"),
      ]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const resolved = path.normalize(path.join(path.dirname(abs), id));
      for (const c of [resolved + ".ts", resolved + ".tsx", resolved + ".js"]) {
        if (fs.existsSync(c)) {
          return loadTs(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  cache.set(key, m.exports);
  return m.exports;
}

function main() {
  const rl = loadTs("lib/rateLimit.ts");
  const { getClientIp, RL_AUTH, rateLimit, getRateLimitStoreSize, RATE_LIMIT_MAX_KEYS } = rl;

  // ── A1: getClientIp selection ────────────────────────────────────────────
  ok(
    "spoof_chain_rightmost_public",
    getClientIp({
      headers: { "x-forwarded-for": "203.0.113.5, 119.73.1.2, 119.73.1.2" },
      socket: { remoteAddress: "127.0.0.1" },
    }) === "119.73.1.2"
  );

  ok(
    "single_xff_public",
    getClientIp({ headers: { "x-forwarded-for": "1.2.3.4" }, socket: {} }) === "1.2.3.4"
  );

  ok(
    "skip_rightmost_private_and_loopback",
    getClientIp({
      headers: { "x-forwarded-for": "203.0.113.9, 10.0.0.1, 127.0.0.1" },
      socket: { remoteAddress: "127.0.0.1" },
    }) === "203.0.113.9"
  );

  ok(
    "skip_cgnat_and_link_local",
    getClientIp({
      headers: { "x-forwarded-for": "198.51.100.7, 100.64.1.1, 169.254.1.1" },
      socket: {},
    }) === "198.51.100.7"
  );

  ok(
    "array_header",
    getClientIp({
      headers: { "x-forwarded-for": ["203.0.113.1", "8.8.8.8"] },
      socket: {},
    }) === "8.8.8.8"
  );

  ok(
    "ipv6_public",
    getClientIp({
      headers: { "x-forwarded-for": "2001:db8::1, 2606:4700:4700::1111" },
      socket: {},
    }) === "2606:4700:4700::1111"
  );

  ok(
    "ipv4_mapped_ffff",
    getClientIp({
      headers: { "x-forwarded-for": "::ffff:8.8.4.4" },
      socket: {},
    }) === "8.8.4.4"
  );

  ok(
    "port_stripping_ipv4",
    getClientIp({
      headers: { "x-forwarded-for": "8.8.8.8:443" },
      socket: {},
    }) === "8.8.8.8"
  );

  ok(
    "port_stripping_bracket_ipv6",
    getClientIp({
      headers: { "x-forwarded-for": "[2606:4700:4700::1001]:443" },
      socket: {},
    }) === "2606:4700:4700::1001"
  );

  ok(
    "garbage_values_skipped",
    getClientIp({
      headers: {
        "x-forwarded-for": "unknown, not-an-ip, , 9.9.9.9",
      },
      socket: {},
    }) === "9.9.9.9"
  );

  ok(
    "fallback_xff_to_x_real_ip",
    getClientIp({
      headers: {
        "x-forwarded-for": "10.0.0.1, 127.0.0.1",
        "x-real-ip": "203.0.113.50",
      },
      socket: { remoteAddress: "127.0.0.1" },
    }) === "203.0.113.50"
  );

  ok(
    "fallback_to_socket",
    getClientIp({
      headers: { "x-forwarded-for": "10.1.1.1", "x-real-ip": "192.168.1.1" },
      socket: { remoteAddress: "127.0.0.1" },
    }) === "127.0.0.1"
  );

  ok(
    "fallback_unknown",
    getClientIp({ headers: {}, socket: {} }) === "unknown"
  );

  // ── RL_AUTH keyed by selected IP (spoof first hop no longer fresh bucket) ─
  {
    let lastAllowed = true;
    for (let n = 1; n <= 6; n++) {
      const ip = getClientIp({
        headers: {
          "x-forwarded-for": `203.0.113.${n}, 119.73.1.2`,
          "x-real-ip": "119.73.1.2",
        },
        socket: { remoteAddress: "127.0.0.1" },
      });
      ok(`rl_auth_selected_ip_stable_${n}`, ip === "119.73.1.2");
      const r = RL_AUTH(ip);
      lastAllowed = r.allowed;
    }
    ok("rl_auth_spoof_no_fresh_bucket_6th_denied", lastAllowed === false);
  }

  // Fresh IP still allowed
  {
    const ip = getClientIp({
      headers: { "x-forwarded-for": "198.51.100.99" },
      socket: {},
    });
    ok("rl_auth_different_ip_still_allowed", RL_AUTH(ip).allowed === true);
  }

  // ── A2 source assertions ─────────────────────────────────────────────────
  const adminAuth = read("lib/adminAuth.ts");
  ok(
    "a2_adminAuth_uses_getClientIp",
    /import\s*\{\s*getClientIp\s*\}\s*from\s*["']@\/lib\/rateLimit["']/.test(adminAuth) &&
      /getClientIp\(req\)\.slice\(0,\s*64\)/.test(adminAuth) &&
      !/headers\["x-forwarded-for"\]/.test(adminAuth.match(/getRequestMeta[\s\S]*?^}/m)?.[0] || "")
  );

  const uploadSrc = read("pages/api/upload.ts");
  ok(
    "a2_upload_uses_getClientIp",
    /import\s*\{\s*getClientIp\s*\}\s*from\s*["'].*rateLimit["']/.test(uploadSrc) &&
      /getClientIp\(req\)/.test(uploadSrc) &&
      !/xf\.split\(","\)\[0\]/.test(uploadSrc)
  );

  const favSrc = read("pages/api/upload-favicon.ts");
  ok(
    "a2_upload_favicon_uses_getClientIp",
    /import\s*\{\s*getClientIp\s*\}\s*from\s*["'].*rateLimit["']/.test(favSrc) &&
      /getClientIp\(req\)/.test(favSrc) &&
      !/xf\.split\(","\)\[0\]/.test(favSrc)
  );

  const reconSrc = read("pages/api/admin-seo-issues/reconcile.ts");
  ok(
    "a2_reconcile_uses_getClientIp",
    /import\s*\{\s*getClientIp\s*\}\s*from\s*["']@\/lib\/rateLimit["']/.test(reconSrc) &&
      /getClientIp\(req\)\.slice\(0,\s*64\)/.test(reconSrc) &&
      !/headers\["x-forwarded-for"\]/.test(reconSrc)
  );

  const runtimeSrc = read("pages/api/admin-server-runtime.ts");
  ok(
    "a3_runtime_selectedClientIp",
    /selectedClientIp:\s*getClientIp\(req\)/.test(runtimeSrc)
  );

  const sidhu = read("app/sidhu/page.tsx");
  ok(
    "a3_sidhu_selected_client_ip_line",
    /Selected client IP \(rate-limit key\)/.test(sidhu) &&
      /requestIpChain\.selectedClientIp/.test(sidhu)
  );

  // ── B: store cap ─────────────────────────────────────────────────────────
  ok("store_cap_constant", RATE_LIMIT_MAX_KEYS === 20000);
  {
    const windowMs = 60 * 60 * 1000;
    // Fill to exactly MAX_KEYS with unique keys (long window so they stay)
    let i = 0;
    while (getRateLimitStoreSize() < RATE_LIMIT_MAX_KEYS) {
      rateLimit(`cap-fill:${i++}`, 100, windowMs);
    }
    ok(
      "store_cap_filled_to_max",
      getRateLimitStoreSize() === RATE_LIMIT_MAX_KEYS,
      `size=${getRateLimitStoreSize()}`
    );
    // One more insert must evict down to ~90% then add → <= 90%+1
    rateLimit(`cap-overflow:${Date.now()}`, 100, windowMs);
    const afterEvict = getRateLimitStoreSize();
    const target = Math.floor(RATE_LIMIT_MAX_KEYS * 0.9);
    ok(
      "store_cap_enforced",
      afterEvict <= RATE_LIMIT_MAX_KEYS,
      `size=${afterEvict} max=${RATE_LIMIT_MAX_KEYS}`
    );
    ok(
      "store_cap_evicted_under_90pct_band",
      afterEvict <= target + 1 && afterEvict >= target,
      `size=${afterEvict} target=${target}`
    );
    // Limits still work after eviction
    const r1 = rateLimit("post-evict-unique-key", 2, windowMs);
    const r2 = rateLimit("post-evict-unique-key", 2, windowMs);
    const r3 = rateLimit("post-evict-unique-key", 2, windowMs);
    ok(
      "limits_work_after_eviction",
      r1.allowed && r2.allowed && !r3.allowed
    );
  }

  // Comment cites Hostinger append evidence
  const rlSrc = read("lib/rateLimit.ts");
  ok(
    "comment_cites_hostinger_append_evidence",
    /Hostinger/i.test(rlSrc) && /APPEND/i.test(rlSrc) && /RIGHT-most/i.test(rlSrc)
  );
  ok("setInterval_unref_present", /\.unref\s*\(/.test(rlSrc));

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main();
