/**
 * F4UK-PROC-CLARITY-71 — sharp thread cap, server runtime API/panel, Clarity removal.
 * Static + mocked /proc only. No .env*, no real DB, no network, no PII.
 */
const fs = require("fs");
const path = require("path");
const os = require("os");
const Module = require("module");
const ts = require("typescript");
const { execSync } = require("child_process");

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

function exists(rel) {
  return fs.existsSync(path.join(ROOT, rel));
}

const cache = new Map();
function loadTs(rel, stubs = {}) {
  const abs = path.join(ROOT, rel);
  const key = abs + "::" + Object.keys(stubs).sort().join(",");
  if (cache.has(key)) return cache.get(key);
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

function writeTree(root, tree) {
  fs.mkdirSync(root, { recursive: true });
  for (const [name, value] of Object.entries(tree)) {
    const p = path.join(root, name);
    if (typeof value === "string") {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, value);
    } else if (value && value.__symlink) {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      try {
        fs.symlinkSync(value.__symlink, p);
      } catch {
        // Windows may need junction; skip cwd hints if symlink fails
      }
    } else {
      writeTree(p, value);
    }
  }
}

const upload = read("pages/api/upload.ts");
ok(
  "sharp_concurrency_1",
  /sharp\.concurrency\(\s*1\s*\)/.test(upload)
);
ok(
  "sharp_cache_false",
  /sharp\.cache\(\s*false\s*\)/.test(upload)
);
ok(
  "sharp_imported_at_module_scope",
  /^import\s+sharp\s+from\s+["']sharp["']/m.test(upload) ||
    /from\s+["']sharp["']/.test(upload.split("export default")[0])
);

const apiSrc = read("pages/api/admin-server-runtime.ts");
ok("runtime_api_get_only", /req\.method\s*!==\s*["']GET["']/.test(apiSrc));
ok(
  "runtime_api_401_via_requireAdminRole",
  /requireAdminRole\(req,\s*res,\s*\[["']super_admin["']\]/.test(apiSrc)
);
ok(
  "runtime_api_super_admin_only",
  /\[["']super_admin["']\]/.test(apiSrc)
);
ok(
  "runtime_api_no_store",
  /Cache-Control["']\s*,\s*["']no-store/.test(apiSrc) || /setAdminNoStore\(res\)/.test(apiSrc)
);
ok(
  "runtime_api_same_origin_check",
  /assertSameOriginGet|invalid origin/.test(apiSrc)
);
ok(
  "runtime_api_never_reads_environ",
  !/\/environ\b/.test(apiSrc) &&
    !/\/environ\b/.test(read("lib/serverRuntime.ts")) &&
    !/readFileSync\([^)]*environ/.test(apiSrc + read("lib/serverRuntime.ts"))
);
ok(
  "runtime_api_no_full_cmdline",
  !/\/cmdline\b/.test(apiSrc) &&
    !/\/cmdline\b/.test(read("lib/serverRuntime.ts")) &&
    !/readFileSync\([^)]*cmdline/.test(apiSrc + read("lib/serverRuntime.ts"))
);

const runtime = loadTs("lib/serverRuntime.ts");
ok(
  "site_hint_parsing_domains",
  runtime.siteHintFromCwd("/home/u/domains/firestick4uk.com/public_html") ===
    "firestick4uk.com"
);
ok(
  "site_hint_null_without_domains",
  runtime.siteHintFromCwd("/var/www/html") === null
);
ok(
  "parse_proc_status_threads_uid",
  (() => {
    const p = runtime.parseProcStatus(
      "Name:\tnode\nUid:\t1000\t1000\t1000\t1000\nVmRSS:\t204800 kB\nThreads:\t7\n"
    );
    return p.name === "node" && p.threads === 7 && p.uid === 1000 && p.vmRssKb === 204800;
  })()
);

ok(
  "available_false_when_proc_missing",
  runtime.collectServerRuntime({
    procRoot: path.join(os.tmpdir(), "f4uk-no-proc-" + Date.now()),
  }).available === false
);

const mockProc = path.join(os.tmpdir(), "f4uk-proc-" + Date.now());
try {
  writeTree(mockProc, {
    self: {
      status:
        "Name:\tnode\nUid:\t42\t42\t42\t42\nVmRSS:\t102400 kB\nThreads:\t3\n",
    },
    "101": {
      status:
        "Name:\tnode\nUid:\t42\t42\t42\t42\nVmRSS:\t51200 kB\nThreads:\t5\n",
      cwd: { __symlink: "/home/u/domains/firestick4uk.com/public_html" },
    },
    "102": {
      status:
        "Name:\tphp-fpm\nUid:\t42\t42\t42\t42\nVmRSS:\t25600 kB\nThreads:\t2\n",
      cwd: { __symlink: "/home/u/domains/other.example/public_html" },
    },
    "103": {
      status:
        "Name:\trooty\nUid:\t0\t0\t0\t0\nVmRSS:\t1000 kB\nThreads:\t99\n",
    },
  });
  runtime.clearServerRuntimeCache();
  const cwdMap = {
    101: "/home/u/domains/firestick4uk.com/public_html",
    102: "/home/u/domains/other.example/public_html",
  };
  const snap = runtime.collectServerRuntime({
    procRoot: mockProc,
    selfPid: 101,
    nodeVersion: "v20.20.2",
    uptimeSec: 12,
    memoryUsage: { rss: 10 * 1024 * 1024, heapUsed: 4 * 1024 * 1024, heapTotal: 8 * 1024 * 1024, external: 0, arrayBuffers: 0 },
    cpuCount: 2,
    loadavg: [0.1, 0.2, 0.3],
    readCwd: (pid) => cwdMap[pid] || null,
  });
  ok("mock_available_true", snap.available === true);
  ok(
    "same_uid_filter_excludes_other_uid",
    Array.isArray(snap.processes) &&
      snap.processes.every((p) => p.pid !== 103) &&
      snap.processes.some((p) => p.pid === 101) &&
      snap.processes.some((p) => p.pid === 102)
  );
  ok(
    "site_hint_on_processes",
    snap.processes.some((p) => p.pid === 101 && p.site === "firestick4uk.com") &&
      snap.processes.some((p) => p.pid === 102 && p.site === "other.example")
  );
  ok(
    "totals_sum_threads",
    snap.totalThreads ===
      snap.processes.reduce((s, p) => s + p.threads, 0) &&
      snap.planThreadLimit === 200
  );
  ok(
    "sorted_threads_desc",
    snap.processes[0].threads >= snap.processes[snap.processes.length - 1].threads
  );
} finally {
  try {
    fs.rmSync(mockProc, { recursive: true, force: true });
  } catch {
    /* ignore */
  }
}

const sidhu = read("app/sidhu/page.tsx");
ok(
  "server_panel_renders",
  /data-testid=["']server-runtime-panel["']/.test(sidhu) &&
    /admin-server-runtime/.test(sidhu) &&
    /data-testid=["']server-runtime-table["']/.test(sidhu)
);
ok(
  "server_panel_super_admin_only",
  /adminRole\s*===\s*["']super_admin["']/.test(sidhu) &&
    /server-runtime-panel/.test(sidhu)
);
ok(
  "server_panel_no_fast_auto_poll",
  /30_000|30000/.test(sidhu) && !/setInterval\([^)]*admin-server-runtime/.test(sidhu)
);
ok(
  "sidhu_clarity_settings_removed",
  !/Microsoft Clarity/.test(sidhu) &&
    !/clarity_enabled/.test(sidhu) &&
    !/clarity_project_id/.test(sidhu)
);

const clarityGone = [
  "components/MicrosoftClarity.tsx",
  "lib/clarityConfig.ts",
  "lib/clarityConsent.ts",
  "lib/clarityGating.ts",
  "scripts/phase-clarity-35-tests.js",
];
ok(
  "clarity_modules_deleted",
  clarityGone.every((f) => !exists(f))
);
ok(
  "clarity_suite_retired",
  exists("scripts/retired/phase-clarity-35-tests.js") &&
    /retired 13 Nov 2026 — Clarity removed \(F4UK-PROC-CLARITY-71\)/.test(
      read("scripts/retired/phase-clarity-35-tests.js")
    )
);

const CLARITY_RE =
  /clarity\.ms|MicrosoftClarity|data-clarity-mask|clarity_enabled|clarity_project_id|clarityGating|clarityConsent|clarityConfig/i;
function walkClarityHits(dirRel) {
  const abs = path.join(ROOT, dirRel);
  const hits = [];
  function walk(d) {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      if (ent.name === "node_modules" || ent.name === ".next") continue;
      const p = path.join(d, ent.name);
      if (ent.isDirectory()) walk(p);
      else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(ent.name)) {
        const txt = fs.readFileSync(p, "utf8");
        if (CLARITY_RE.test(txt)) {
          hits.push(path.relative(ROOT, p).replace(/\\/g, "/"));
        }
      }
    }
  }
  if (fs.existsSync(abs)) walk(abs);
  return hits;
}
const clarityHits = ["app", "components", "lib", "pages"].flatMap(walkClarityHits);
const nextCfg = read("next.config.ts");
ok(
  "no_clarity_hosts_in_next_config",
  !/clarity/i.test(nextCfg)
);
ok(
  "no_clarity_code_in_app_components_lib_pages",
  clarityHits.length === 0,
  clarityHits.join("\n").slice(0, 400)
);

const consent = read("components/TrackingConsent.tsx");
const consentLib = read("lib/trackingConsent.ts");
ok(
  "consent_version_still_2",
  /TRACKING_CONSENT_VERSION\s*=\s*2/.test(consentLib)
);
ok(
  "consent_clarity_sentence_removed",
  !/Microsoft Clarity only if we switch it on/.test(consent)
);
ok(
  "consent_analytics_rest_unchanged",
  /Helps us understand how the site is used: Google Analytics and\s+our own site statistics \(pages viewed, traffic source, device\s+type, clicks, scrolling and time on page, cart and checkout\s+steps; never what you type into forms\)\. No effect on cart or\s+checkout\./.test(
    consent
  )
);
ok(
  "sa_settings_keys_drop_clarity",
  !/clarity_enabled/.test(read("lib/adminPermissions.ts")) &&
    !/clarity_project_id/.test(read("lib/adminPermissions.ts"))
);
ok(
  "defaults_drop_clarity",
  !/clarity_/.test(read("lib/siteContentDefaults.ts"))
);
ok(
  "layout_no_microsoft_clarity_mount",
  !/MicrosoftClarity/.test(read("app/layout.tsx"))
);

// SEO/nav/layout metadata: only the removed Clarity mount line differs in layout import/JSX
ok(
  "layout_keeps_tracking_consent_and_ads",
  /TrackingConsent/.test(read("app/layout.tsx")) &&
    /AdsConversionTracking/.test(read("app/layout.tsx"))
);

console.log(`\nPROC-CLARITY-71: ${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
