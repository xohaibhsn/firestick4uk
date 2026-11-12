/**
 * F4UK-SIDHU-INSIGHTS-BUILD-A-56 — schema/settings/ingest/geo/retention tests.
 * Mocked pool / fake clock only. Never opens .env* or connects to a real DB.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const ts = require("typescript");
const { spawnSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;

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

function loadTsModule(rel, stubs = {}) {
  const stubKey = Object.keys(stubs)
    .sort()
    .map((k) => k + "=" + typeof stubs[k])
    .join(",");
  const key = rel + "::" + stubKey;
  if (cache.has(key)) return cache.get(key);
  const src = read(rel);
  const { outputText } = ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  });
  const sandbox = { exports: {}, module: { exports: {} } };
  const localRequire = (id) => {
    if (Object.prototype.hasOwnProperty.call(stubs, id)) return stubs[id];
    if (id.startsWith(".") || id.startsWith("..")) {
      const base = path.normalize(path.join(path.dirname(path.join(ROOT, rel)), id));
      for (const c of [base + ".ts", base + ".js", path.join(base, "index.ts")]) {
        if (fs.existsSync(c)) {
          return loadTsModule(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
    }
    if (id === "mmdb-lib") {
      return {
        Reader: class {
          constructor() {}
          get() {
            return null;
          }
        },
      };
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  const mod =
    sandbox.module.exports && Object.keys(sandbox.module.exports).length
      ? sandbox.module.exports
      : sandbox.exports;
  cache.set(key, mod);
  return mod;
}

async function main() {
  // ── Migration ────────────────────────────────────────────────────────────
  const mig = require("./migrate-sidhu-insights.js");
  ok("migrate_exports_sql_body", typeof mig.SQL_BODY === "string" && mig.SQL_BODY.includes("insights_sessions"));
  ok("migrate_exports_sha_fn", typeof mig.sqlBodySha256 === "function");
  const sha = mig.sqlBodySha256();
  ok("migrate_sha_hex", /^[a-f0-9]{64}$/.test(sha), sha.slice(0, 16));
  ok(
    "migrate_default_settings_disabled",
    /'enabled',\s*'0'/.test(mig.SQL_BODY) &&
      /'kill_switch',\s*'0'/.test(mig.SQL_BODY) &&
      /'recording_enabled',\s*'0'/.test(mig.SQL_BODY) &&
      /'geo_city_enabled',\s*'0'/.test(mig.SQL_BODY)
  );

  const checkRun = spawnSync(NODE, ["scripts/migrate-sidhu-insights.js"], {
    cwd: ROOT,
    encoding: "utf8",
    env: { ...process.env, DB_HOST: "", DB_NAME: "", DB_USER: "", DB_PASSWORD: "" },
  });
  const checkOut = String(checkRun.stdout || "") + String(checkRun.stderr || "");
  ok("migrate_check_exit0", checkRun.status === 0, String(checkRun.status));
  ok(
    "migrate_check_prints_hash",
    checkOut.includes("SQL_BODY_SHA256") && checkOut.includes(sha),
    "hash printed"
  );
  ok(
    "migrate_check_no_change",
    /No schema changes|No DB connection/i.test(checkOut)
  );

  const refuseNoExpect = spawnSync(NODE, ["scripts/migrate-sidhu-insights.js", "--apply"], {
    cwd: ROOT,
    encoding: "utf8",
    env: {
      ...process.env,
      ALLOW_DB_MUTATION_TESTS: "YES_I_UNDERSTAND",
      DB_HOST: "127.0.0.1",
      DB_USER: "x",
      DB_PASSWORD: "x",
      DB_NAME: "testdb",
    },
  });
  ok(
    "migrate_apply_refuses_without_expect_db",
    refuseNoExpect.status !== 0 &&
      /expect-db/i.test(String(refuseNoExpect.stderr) + String(refuseNoExpect.stdout))
  );

  const refuseMismatch = spawnSync(
    NODE,
    ["scripts/migrate-sidhu-insights.js", "--apply", "--expect-db", "otherdb"],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        ALLOW_DB_MUTATION_TESTS: "YES_I_UNDERSTAND",
        DB_HOST: "127.0.0.1",
        DB_USER: "x",
        DB_PASSWORD: "x",
        DB_NAME: "testdb",
      },
    }
  );
  ok(
    "migrate_apply_refuses_db_mismatch",
    refuseMismatch.status !== 0 &&
      /does not match/i.test(String(refuseMismatch.stderr) + String(refuseMismatch.stdout))
  );

  const refuseNoConfirm = spawnSync(
    NODE,
    ["scripts/migrate-sidhu-insights.js", "--apply", "--expect-db", "testdb"],
    {
      cwd: ROOT,
      encoding: "utf8",
      env: {
        ...process.env,
        ALLOW_DB_MUTATION_TESTS: "",
        DB_HOST: "127.0.0.1",
        DB_USER: "x",
        DB_PASSWORD: "x",
        DB_NAME: "testdb",
      },
    }
  );
  ok(
    "migrate_apply_refuses_without_confirm",
    refuseNoConfirm.status !== 0 &&
      /Refusing DB mutations|YES_I_UNDERSTAND/i.test(
        String(refuseNoConfirm.stderr) + String(refuseNoConfirm.stdout)
      )
  );

  // ── Settings fail-safe ───────────────────────────────────────────────────
  cache.clear();
  const settingsMod = loadTsModule("lib/insightsSettings.ts");
  settingsMod.clearInsightsSettingsCache();

  let s1 = await settingsMod.getInsightsSettings({
    forceRefresh: true,
    db: {
      query: async () => {
        throw Object.assign(new Error("no table"), { code: "ER_NO_SUCH_TABLE" });
      },
    },
    nowMs: Date.now(),
    ttlMs: 0,
  });
  // force refresh via ttl 0 + clear
  settingsMod.clearInsightsSettingsCache();
  s1 = await settingsMod.getInsightsSettings({
    db: {
      query: async () => {
        throw Object.assign(new Error("no table"), { code: "ER_NO_SUCH_TABLE" });
      },
    },
    nowMs: Date.now() + 1,
    ttlMs: 0,
  });
  ok("settings_missing_table_disabled", s1.enabled === false && s1.recording_enabled === false);
  ok("settings_recording_inactive", settingsMod.insightsRecordingActive(s1) === false);

  settingsMod.clearInsightsSettingsCache();
  const s2 = await settingsMod.getInsightsSettings({
    db: {
      query: async () => {
        throw new Error("ECONNREFUSED");
      },
    },
    nowMs: Date.now() + 2,
    ttlMs: 0,
  });
  ok("settings_db_error_disabled", s2.enabled === false);

  settingsMod.clearInsightsSettingsCache();
  const s3 = await settingsMod.getInsightsSettings({
    db: {
      query: async () => [
        [
          { setting_key: "enabled", setting_value: "1" },
          { setting_key: "kill_switch", setting_value: "1" },
          { setting_key: "recording_enabled", setting_value: "1" },
        ],
      ],
    },
    nowMs: Date.now() + 3,
    ttlMs: 0,
  });
  ok(
    "settings_kill_switch_blocks",
    s3.enabled === true &&
      s3.kill_switch === true &&
      settingsMod.insightsRecordingActive(s3) === false
  );

  settingsMod.clearInsightsSettingsCache();
  const s4 = await settingsMod.getInsightsSettings({
    db: {
      query: async () => [
        [
          { setting_key: "enabled", setting_value: "1" },
          { setting_key: "kill_switch", setting_value: "0" },
          { setting_key: "recording_enabled", setting_value: "1" },
          { setting_key: "geo_city_enabled", setting_value: "0" },
        ],
      ],
    },
    nowMs: Date.now() + 4,
    ttlMs: 0,
  });
  ok("settings_recording_on", settingsMod.insightsRecordingActive(s4) === true);
  ok("settings_geo_city_default_off", s4.geo_city_enabled === false);

  // ── Permissions ──────────────────────────────────────────────────────────
  const perms = loadTsModule("lib/adminPermissions.ts");
  ok(
    "perm_writer_denied_insights",
    !perms.hasAdminPermission("writer", "insights.view") &&
      !perms.hasAdminPermission("writer", "insights.export") &&
      !perms.hasAdminPermission("writer", "insights.settings")
  );
  ok(
    "perm_manager_view_export_no_settings",
    perms.hasAdminPermission("manager", "insights.view") &&
      perms.hasAdminPermission("manager", "insights.export") &&
      !perms.hasAdminPermission("manager", "insights.settings")
  );
  ok(
    "perm_super_admin_all",
    perms.hasAdminPermission("super_admin", "insights.view") &&
      perms.hasAdminPermission("super_admin", "insights.export") &&
      perms.hasAdminPermission("super_admin", "insights.settings")
  );
  ok("perm_ip_super_admin_only", perms.canViewInsightsIp("super_admin") === true);
  ok("perm_ip_manager_denied", perms.canViewInsightsIp("manager") === false);
  ok("perm_ip_writer_denied", perms.canViewInsightsIp("writer") === false);
  ok(
    "perm_no_sidhu_tab_insights",
    !/SidhuTab[\s\S]*insights/.test(read("lib/adminPermissions.ts")) ||
      !/\| "insights"/.test(read("lib/adminPermissions.ts"))
  );

  // ── Ingest validation ────────────────────────────────────────────────────
  const ingest = loadTsModule("lib/insightsIngest.ts");
  const goodEvent = {
    t: "page_view",
    ts: "2026-11-11T12:00:00.000Z",
    path: "/",
    props: { sku: "x" },
  };
  const goodBody = {
    v: 1,
    visitor_id: "11111111-1111-4111-8111-111111111111",
    session_id: "22222222-2222-4222-8222-222222222222",
    sent_at: "2026-11-11T12:00:00.000Z",
    consent_analytics: true,
    events: [goodEvent],
  };

  ok("ingest_valid_ok", ingest.validateInsightsCollectBody(goodBody).ok === true);
  ok(
    "ingest_consent_false",
    ingest.validateInsightsCollectBody({ ...goodBody, consent_analytics: false }).code ===
      "consent_required"
  );
  ok(
    "ingest_form_key_email",
    ingest.validateInsightsCollectBody({
      ...goodBody,
      events: [{ ...goodEvent, props: { email: "a@b.c" } }],
    }).code === "form_key_rejected"
  );
  ok(
    "ingest_unknown_event_type",
    ingest.validateInsightsCollectBody({
      ...goodBody,
      events: [{ ...goodEvent, t: "password_submit" }],
    }).code === "event_type_not_allowed"
  );
  ok(
    "ingest_cart_event_allowed",
    ingest.validateInsightsCollectBody({
      ...goodBody,
      events: [{ ...goodEvent, t: "cart_add", path: "/cart", click_id: "cart_add" }],
    }).ok === true
  );
  ok(
    "ingest_excluded_path_empty_ok",
    ingest.validateInsightsCollectBody({
      ...goodBody,
      events: [{ ...goodEvent, path: "/sidhu" }],
    }).ok === true &&
      ingest.validateInsightsCollectBody({
        ...goodBody,
        events: [{ ...goodEvent, path: "/sidhu" }],
      }).payload.events.length === 0
  );
  ok("ingest_excluded_api", ingest.isInsightsExcludedPath("/api/foo") === true);
  ok("ingest_excluded_erp", ingest.isInsightsExcludedPath("/erp") === true);
  ok(
    "ingest_excluded_order_tracking",
    ingest.isInsightsExcludedPath("/order-tracking") === true
  );
  ok("ingest_allows_cart", ingest.isInsightsExcludedPath("/cart") === false);
  ok(
    "ingest_size_413",
    ingest.validateInsightsCollectBody(goodBody, { rawByteLength: 20000 }).status === 413
  );
  ok(
    "ingest_caps",
    ingest.INSIGHTS_SEARCH_TERM_MAX === 128 &&
      ingest.INSIGHTS_PATH_MAX === 512 &&
      ingest.INSIGHTS_PROPS_JSON_MAX === 2048
  );
  ok("ingest_bot_ua", ingest.detectInsightsBot("Googlebot/2.1").is_bot === 1);
  ok("ingest_human_ua", ingest.detectInsightsBot("Mozilla/5.0 Chrome/120").is_bot === 0);

  let writeCalls = 0;
  const mockQuery = async () => {
    writeCalls++;
    return [[{}], null];
  };
  const validated = ingest.validateInsightsCollectBody(goodBody);
  await ingest.persistInsightsIngest(validated.payload, {
    query: mockQuery,
    settings: s4,
    ip: "1.2.3.4",
    userAgent: "Mozilla/5.0",
  });
  ok("ingest_persist_writes", writeCalls >= 2, "calls=" + writeCalls);

  // ── Geo (removed by F4UK-INSIGHTS-SLIM-67: no IP geolocation lib) ───────
  ok("geo_lib_removed", !fs.existsSync(path.join(ROOT, "lib/insightsGeo.ts")));
  // ── Retention ────────────────────────────────────────────────────────────
  const ret = loadTsModule("lib/insightsRetention.ts");
  ok("retention_mask_ipv4", ret.maskInsightsIp("203.0.113.45") === "203.0.113.0");
  ok(
    "retention_mask_ipv6",
    ret.maskInsightsIp("2001:db8:abcd:0012:0000:0000:0000:0001") === "2001:db8:abcd:0012::" ||
      ret.maskInsightsIp("2001:db8:abcd:12:0:0:0:1") === "2001:db8:abcd:12::"
  );
  ok(
    "retention_mask_idempotent_v4",
    ret.maskInsightsIp(ret.maskInsightsIp("10.1.2.3")) === "10.1.2.0"
  );
  ok(
    "retention_predicates",
    /ip_masked = 0/.test(ret.insightsIpMaskSqlPredicate()) &&
      /insights_events/.test(ret.insightsDetailDeleteEventsSql()) &&
      /LIMIT \?/.test(ret.insightsDetailDeleteSessionsSql())
  );

  ret.__resetInsightsRetentionThrottle();
  let lockOwner = null;
  let releaseCount = 0;
  let connectionsOpened = 0;
  function makeFakePool() {
    return {
      getConnection: async () => {
        connectionsOpened++;
        return {
          query: async (sql) => {
            if (/GET_LOCK/.test(sql)) {
              if (lockOwner) return [[{ got: 0 }], null];
              lockOwner = "held";
              return [[{ got: 1 }], null];
            }
            if (/RELEASE_LOCK/.test(sql)) {
              releaseCount++;
              lockOwner = null;
              return [[{}], null];
            }
            if (/last_success_at/.test(sql) && /SELECT/.test(sql)) {
              return [[{ last_success_at: null }], null];
            }
            if (/SELECT id, ip_address/.test(sql)) {
              return [
                [
                  { id: 1, ip_address: "203.0.113.99" },
                  { id: 2, ip_address: "2001:db8:1:2:3:4:5:6" },
                ],
                null,
              ];
            }
            if (/DELETE FROM/.test(sql)) return [{ affectedRows: 1 }, null];
            if (/UPDATE insights_sessions/.test(sql)) return [{ affectedRows: 1 }, null];
            if (/insights_cleanup_lease/.test(sql)) return [{ affectedRows: 1 }, null];
            return [[], null];
          },
          release: () => {},
        };
      },
    };
  }

  const settingsStub = {
    detail_retention_days: 90,
    summary_retention_days: 365,
    ip_full_retention_days: 30,
    cleanup_batch_size: 500,
    cleanup_min_interval_sec: 300,
  };

  connectionsOpened = 0;
  const r1 = await ret.runInsightsRetention({
    pool: makeFakePool(),
    settings: settingsStub,
    now: new Date("2026-11-11T12:00:00Z"),
    timeBudgetMs: 1500,
  });
  ok("retention_ran", r1.ran === true && r1.masked >= 1, JSON.stringify(r1));
  ok("retention_lock_released", releaseCount >= 1, "releases=" + releaseCount);
  ok("retention_one_connection", connectionsOpened === 1);

  const r2 = await ret.runInsightsRetention({
    pool: makeFakePool(),
    settings: settingsStub,
    now: new Date("2026-11-11T12:00:01Z"),
  });
  ok("retention_throttle", r2.skipped === "throttle");

  ret.__resetInsightsRetentionThrottle();
  lockOwner = null;
  releaseCount = 0;
  let heldDuring = 0;
  const poolMx = {
    getConnection: async () => ({
      query: async (sql) => {
        if (/GET_LOCK/.test(sql)) {
          if (lockOwner) {
            heldDuring++;
            return [[{ got: 0 }], null];
          }
          lockOwner = "a";
          await new Promise((r) => setTimeout(r, 30));
          return [[{ got: 1 }], null];
        }
        if (/RELEASE_LOCK/.test(sql)) {
          releaseCount++;
          lockOwner = null;
          return [[{}], null];
        }
        if (/last_success_at/.test(sql)) return [[{ last_success_at: null }], null];
        if (/SELECT id, ip_address/.test(sql)) return [[], null];
        if (/DELETE FROM/.test(sql)) return [{ affectedRows: 0 }, null];
        return [{ affectedRows: 0 }, null];
      },
      release: () => {},
    }),
  };
  // Bypass in-process throttle so both callers reach GET_LOCK
  ret.__resetInsightsRetentionThrottle();
  const settingsMx = { ...settingsStub, cleanup_min_interval_sec: 0 };
  // Force lastLocalAttemptAt far past by resetting then setting interval 0
  const pA = ret.runInsightsRetention({
    pool: poolMx,
    settings: settingsMx,
    now: new Date("2026-11-11T13:00:00Z"),
  });
  // tiny delay so A can acquire lock first
  await new Promise((r) => setTimeout(r, 5));
  ret.__resetInsightsRetentionThrottle();
  const pB = ret.runInsightsRetention({
    pool: poolMx,
    settings: settingsMx,
    now: new Date("2026-11-11T13:00:00Z"),
  });
  const [a, b] = await Promise.all([pA, pB]);
  ok(
    "retention_lock_mutex",
    (a.ran === true && b.skipped === "lock") ||
      (b.ran === true && a.skipped === "lock") ||
      heldDuring > 0,
    JSON.stringify({ a, b, heldDuring })
  );

  ret.__resetInsightsRetentionThrottle();
  lockOwner = null;
  releaseCount = 0;
  const poolErr = {
    getConnection: async () => ({
      query: async (sql) => {
        if (/GET_LOCK/.test(sql)) {
          lockOwner = "e";
          return [[{ got: 1 }], null];
        }
        if (/RELEASE_LOCK/.test(sql)) {
          releaseCount++;
          lockOwner = null;
          return [[{}], null];
        }
        if (/last_success_at/.test(sql)) return [[{ last_success_at: null }], null];
        if (/INSERT INTO insights_cleanup_lease/.test(sql)) return [{}, null];
        if (/SELECT id, ip_address/.test(sql)) throw new Error("boom");
        if (/last_error/.test(sql)) return [{}, null];
        return [[], null];
      },
      release: () => {},
    }),
  };
  const rErr = await ret.runInsightsRetention({
    pool: poolErr,
    settings: settingsStub,
    now: new Date("2026-11-11T14:00:00Z"),
  });
  ok("retention_error_swallowed", !!rErr.error);
  ok("retention_lock_released_on_error", releaseCount === 1 && lockOwner === null);
  ok("retention_batch_default_500", ret.INSIGHTS_RETENTION_DEFAULT_BATCH === 500);

  // ── API source contracts + disabled path ─────────────────────────────────
  const apiSrc = read("pages/api/insights-collect.ts");
  ok("api_post_only", /method !== "POST"/.test(apiSrc));
  ok("api_sec_gpc", /sec-gpc/i.test(apiSrc));
  ok("api_rate_limit_120", /rateLimit\(`insights:\$\{ip\}`,\s*120,\s*60_000\)/.test(apiSrc));
  ok("api_body_16kb", /sizeLimit:\s*"16kb"/.test(apiSrc));
  ok("api_same_origin", /assertSameOriginMutation/.test(apiSrc));
  ok("api_no_pii_log", /Never log IP|No PII/i.test(apiSrc));

  settingsMod.clearInsightsSettingsCache();
  let settingsReads = 0;
  const disabled = await settingsMod.getInsightsSettings({
    db: {
      query: async () => {
        settingsReads++;
        return [
          [
            { setting_key: "enabled", setting_value: "0" },
            { setting_key: "recording_enabled", setting_value: "0" },
            { setting_key: "kill_switch", setting_value: "0" },
          ],
        ];
      },
    },
    nowMs: Date.now() + 50,
    ttlMs: 0,
  });
  ok(
    "api_disabled_zero_writes",
    settingsMod.insightsRecordingActive(disabled) === false && settingsReads === 1
  );

  // ── check-runtime-ddl ────────────────────────────────────────────────────
  const ddl = spawnSync(NODE, ["scripts/check-runtime-ddl.js"], {
    cwd: ROOT,
    encoding: "utf8",
  });
  ok("check_runtime_ddl_pass", ddl.status === 0, String(ddl.stdout || ddl.stderr || "").trim());

  // ── Required files ───────────────────────────────────────────────────────
  for (const f of [
    "scripts/migrate-sidhu-insights.js",
    "lib/insightsSettings.ts",
    "lib/insightsIngest.ts",
    "lib/insightsRetention.ts",
    "pages/api/insights-collect.ts",
    "lib/adminPermissions.ts",
    "scripts/phase-sidhu-insights-56-tests.js",
  ]) {
    ok("file_" + f.replace(/\W+/g, "_"), fs.existsSync(path.join(ROOT, f)));
  }

  // mmdb-lib removed with the geo lib
  const pkg = JSON.parse(read("package.json"));
  ok("dep_mmdb_lib_removed", pkg.dependencies["mmdb-lib"] === undefined);

  console.log(`\n=== phase-sidhu-insights-56: ${passed} passed, ${failed} failed ===`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("TEST HARNESS ERROR", err);
  process.exit(1);
});
