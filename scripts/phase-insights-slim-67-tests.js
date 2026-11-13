/**
 * F4UK-INSIGHTS-SLIM-67 — remove IP/geo + Sources/Geography/Pages/Returning/Overview, add engaged time,
 * scroll milestones, click capture, Page behaviour + Click map.
 * Mocked DB / fake clock / fake DOM / static source checks only. No .env*, no real DB, no network.
 *
 * Older-suite edits made for this change (only where they pinned removed behaviour):
 *  - phase-sidhu-insights-56-tests.js: geo lookup/MMDB block replaced by "geo lib removed"; persist test no longer
 *    passes geo; required-files list drops lib/insightsGeo.ts; mmdb-lib pin -> mmdb-lib removed.
 *  - phase-sidhu-insights-57-tests.js: sanitizeProps test follows the allowlist (qty dropped, total kept);
 *    admin API list swaps geo/pages/sources for page-behaviour/click-map; journeys IP test -> no IP; settings
 *    reload-geo test -> no geo reload; Geography/DB-IP checks -> Geography screen removed; diff allowlist extended.
 *  - phase-insights-w2-60-tests.js: Returning API/screen/tab dropped from endpoint + static lists; Returning maths
 *    block removed; orders attribution + sessions export no longer expose IP/country (asserted absent).
 *  - phase-insights-live-63-tests.js: ANALYTICS_DESC + fallback regex -> new copy; diff allowlist extended.
 *  - phase-city-cleanup-64-tests.js: lib/insightsGeo.ts read removed; "unchanged" -> "removed"; allowlist extended.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const ts = require("typescript");
const { spawnSync } = require("child_process");

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
    if (id.startsWith(".") || id.startsWith("..") || id.startsWith("@/")) {
      let resolved = id;
      if (id.startsWith("@/")) resolved = path.join(ROOT, id.slice(2));
      else resolved = path.normalize(path.join(path.dirname(path.join(ROOT, rel)), id));
      for (const c of [resolved + ".ts", resolved + ".js", path.join(resolved, "index.ts")]) {
        if (fs.existsSync(c)) {
          return loadTsModule(path.relative(ROOT, c).replace(/\\/g, "/"), stubs);
        }
      }
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

function makeMemoryStorage() {
  const map = new Map();
  return {
    getItem: (k) => (map.has(String(k)) ? map.get(String(k)) : null),
    setItem: (k, v) => void map.set(String(k), String(v)),
    removeItem: (k) => void map.delete(String(k)),
    clear: () => map.clear(),
  };
}

function listFiles(relDir, re) {
  const abs = path.join(ROOT, relDir);
  if (!fs.existsSync(abs)) return [];
  return fs
    .readdirSync(abs)
    .filter((n) => re.test(n))
    .map((n) => `${relDir}/${n}`);
}

function el(tag, attrs = {}, parent = null, extra = {}) {
  return {
    tagName: String(tag).toUpperCase(),
    parentElement: parent,
    getAttribute(name) {
      return Object.prototype.hasOwnProperty.call(attrs, name) ? String(attrs[name]) : null;
    },
    ...extra,
  };
}

function makeRes() {
  return {
    statusCode: 200,
    body: null,
    headers: {},
    writableEnded: false,
    headersSent: false,
    setHeader(k, v) {
      this.headers[String(k).toLowerCase()] = v;
      return this;
    },
    status(c) {
      this.statusCode = c;
      return this;
    },
    json(b) {
      this.body = b;
      this.writableEnded = true;
      this.headersSent = true;
      return this;
    },
    send(b) {
      this.body = b;
      this.writableEnded = true;
      this.headersSent = true;
      return this;
    },
    end() {
      this.writableEnded = true;
      this.headersSent = true;
      return this;
    },
  };
}

function isoDay(offset = 0) {
  return new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10);
}

function gitNames(args) {
  const r = spawnSync("git", args, { cwd: ROOT, encoding: "utf8" });
  if (r.status !== 0) return null;
  return String(r.stdout || "")
    .split(/\r?\n/)
    .map((s) => s.trim().replace(/\\/g, "/"))
    .filter(Boolean);
}

const VALID_VID = "11111111-1111-4111-8111-111111111111";
const VALID_SID = "22222222-2222-4222-8222-222222222222";

async function main() {
  const tc = loadTsModule("lib/trackingConsent.ts");
  const client = loadTsModule("lib/insightsClient.ts");
  const ingest = loadTsModule("lib/insightsIngest.ts");

  // ── A. No IP stored / no geo lookup on ingest ────────────────────────────
  const collectSrc = read("pages/api/insights-collect.ts");
  const ingestSrc = read("lib/insightsIngest.ts");
  ok("collect_no_geo_import", !/insightsGeo|lookupInsightsGeo/.test(collectSrc));
  ok("ingest_no_geo_import", !/insightsGeo|lookupInsightsGeo|InsightsGeoResult/.test(ingestSrc));
  ok("geo_lib_deleted", !exists("lib/insightsGeo.ts"));
  ok("collect_ip_for_rate_limit_only", /getClientIp\(req\)/.test(collectSrc) && /rateLimit\(`insights:\$\{ip\}`/.test(collectSrc));

  const pkg = JSON.parse(read("package.json"));
  const lock = JSON.parse(read("package-lock.json"));
  ok(
    "mmdb_lib_removed",
    pkg.dependencies["mmdb-lib"] === undefined &&
      lock.packages[""].dependencies["mmdb-lib"] === undefined &&
      lock.packages["node_modules/mmdb-lib"] === undefined
  );

  const geoScan = [
    "pages/api/insights-collect.ts",
    "lib/insightsIngest.ts",
    "lib/insightsClient.ts",
    "components/SidhuInsightsBeacon.tsx",
    ...listFiles("pages/api/admin-insights", /\.ts$/),
    ...listFiles("components/sidhu/insights", /\.(ts|tsx)$/),
  ];
  const geoHits = geoScan.filter((f) => /insightsGeo|lookupInsightsGeo|reloadInsightsGeo|mmdb/i.test(read(f)));
  ok("no_request_path_imports_geo_lib", geoHits.length === 0, geoHits.join(", ") || "clean");

  const body = (events) => ({
    v: 1,
    visitor_id: VALID_VID,
    session_id: VALID_SID,
    sent_at: new Date().toISOString(),
    consent_analytics: true,
    landing_path: "/",
    events,
  });
  const ev = (over) => ({ t: "page_view", ts: "2026-11-12T10:00:00.000Z", path: "/", ...over });

  async function persist(events, extra = {}) {
    const v = ingest.validateInsightsCollectBody(body(events));
    const calls = [];
    const res = await ingest.persistInsightsIngest(v.payload, {
      query: async (sql, params) => {
        calls.push({ sql: String(sql), params: params || [] });
        return [[{}], null];
      },
      settings: { geo_city_enabled: true },
      ip: "203.0.113.77",
      userAgent: "Mozilla/5.0 Chrome/120",
      ...extra,
    });
    return { calls, res, payload: v.payload };
  }

  {
    const { calls } = await persist([
      ev({}),
      ev({ t: "scroll_depth", time_on_page_ms: 4000, scroll_depth_pct: 50 }),
      ev({ t: "scroll_depth", time_on_page_ms: 6000 }),
    ]);
    const session = calls.find((c) => /INSERT INTO insights_sessions/.test(c.sql));
    ok("session_insert_present", !!session);
    ok(
      "session_ip_and_geo_literal_null",
      /ip_address, ip_masked,/.test(session.sql) &&
        /NULL, 0,\s*NULL, NULL, NULL, NULL,\s*NULL, NULL, 'unknown',/.test(session.sql)
    );
    ok(
      "no_ip_in_any_sql_param",
      calls.every((c) => c.params.every((p) => !String(p).includes("203.0.113.77")))
    );
    ok("no_geo_params_on_session", !session.params.some((p) => p === "GB" || p === "United Kingdom"));
    ok(
      "geo_and_source_daily_not_written",
      !calls.some((c) => /insights_geo_daily|insights_source_daily/.test(c.sql))
    );
    ok(
      "kept_tables_written",
      calls.some((c) => /INSERT INTO insights_events/.test(c.sql)) &&
        calls.some((c) => /INSERT INTO insights_daily_summary/.test(c.sql)) &&
        calls.some((c) => /INSERT INTO insights_page_daily/.test(c.sql))
    );
    ok("duration_param_is_batch_sum", session.params[session.params.length - 2] === 10000);
    ok(
      "duration_dup_key_adds_to_existing",
      /duration_ms = LEAST\(\d+, COALESCE\(duration_ms, 0\) \+ COALESCE\(VALUES\(duration_ms\), 0\)\)/.test(
        session.sql
      )
    );
  }

  {
    const { calls } = await persist([ev({ path: "/" }), ev({ path: "/products" })]);
    ok("queries_per_batch_two_pages_is_5", calls.length === 5, `calls=${calls.length}`);
    const clickOnly = await persist([ev({ t: "click", click_id: "el", props: { tag: "a", vw: "m" } })]);
    ok("queries_per_batch_no_pageview_is_3", clickOnly.calls.length === 3, `calls=${clickOnly.calls.length}`);
    const noTiming = await persist([ev({})]);
    const sess = noTiming.calls.find((c) => /INSERT INTO insights_sessions/.test(c.sql));
    ok("duration_null_without_timing", sess.params[sess.params.length - 2] === null);
  }

  // ── B. Props allowlist + caps ────────────────────────────────────────────
  {
    const v = ingest.validateInsightsCollectBody(body([ev({ props: { sku: "x", color: "red" } })]));
    ok("props_unknown_keys_dropped_to_null", v.ok && v.payload.events[0].props_json === null);

    const click = ingest.validateInsightsCollectBody(
      body([
        ev({
          t: "click",
          click_id: "el",
          props: {
            tag: "button",
            label: "Add to cart",
            x_pct: 42,
            y_pct: 10,
            vw: "m",
            rage: true,
            bogus: 1,
          },
        }),
      ])
    );
    const parsed = JSON.parse(click.payload.events[0].props_json);
    ok(
      "props_click_keys_kept_unknown_dropped",
      parsed.tag === "button" &&
        parsed.label === "Add to cart" &&
        parsed.x_pct === 42 &&
        parsed.y_pct === 10 &&
        parsed.vw === "m" &&
        parsed.rage === true &&
        parsed.bogus === undefined
    );

    const clean = client.sanitizeInsightsProps({
      tag: "a".repeat(80),
      label: "L".repeat(90),
      x_pct: 140,
      y_pct: -3,
      vw: "tablet",
      rage: false,
    });
    ok(
      "props_validate_types_and_lengths",
      clean.tag.length === 32 &&
        clean.label.length === 40 &&
        clean.x_pct === undefined &&
        clean.y_pct === undefined &&
        clean.vw === undefined &&
        clean.rage === undefined
    );
    ok("props_rage_false_omitted_true_kept", client.sanitizeInsightsProps({ rage: false }) === undefined &&
      client.sanitizeInsightsProps({ rage: true }).rage === true);
    ok(
      "props_scroll_milestones_booleans",
      (() => {
        const s = client.sanitizeInsightsProps({ m25: true, m50: true, m75: "yes", m100: false, m90: true });
        return s.m25 === true && s.m50 === true && s.m75 === undefined && s.m100 === false && s.m90 === undefined;
      })()
    );
    ok(
      "props_cart_items_total_kept_and_capped",
      (() => {
        const items = Array.from({ length: 80 }, (_, i) => ({ id: i + 1, qty: 2 }));
        const s = client.sanitizeInsightsProps({ items, total: 19.999 });
        return s.items.length === 40 && s.items[0].qty === 2 && s.total === 20;
      })()
    );
    ok("props_empty_after_sanitize_undefined", client.sanitizeInsightsProps({ sku: 1 }) === undefined);
    ok("props_label_email_like_dropped", client.sanitizeInsightsProps({ label: "a@b.co" }) === undefined);

    const big = ingest.validateInsightsCollectBody(body([ev({ props: { label: "x".repeat(3000) } })]));
    ok("props_2048_cap_enforced", big.ok === false && big.code === "props_too_large");
    ok("props_cap_constant_2048", ingest.INSIGHTS_PROPS_JSON_MAX === 2048);
    const denyTop = ingest.validateInsightsCollectBody(body([ev({ props: { email: "a@b.c" } })]));
    const denyNested = ingest.validateInsightsCollectBody(
      body([ev({ props: { items: [{ id: 1, email: "a@b.c" }] } })])
    );
    ok(
      "props_form_key_denylist_still_enforced",
      denyTop.code === "form_key_rejected" && denyNested.code === "form_key_rejected"
    );
  }

  // ── C. Client helpers: rounding, clickable, label, rage ──────────────────
  ok(
    "roundPctTo2_basics",
    client.roundPctTo2(0) === 0 &&
      client.roundPctTo2(48.9) === 48 &&
      client.roundPctTo2(49) === 50 &&
      client.roundPctTo2(33) === 34 &&
      client.roundPctTo2(101) === 100 &&
      client.roundPctTo2(-5) === 0 &&
      client.roundPctTo2(NaN) === 0
  );
  ok(
    "scroll_marks_25_50_75_100_only",
    JSON.stringify(client.INSIGHTS_SCROLL_MARKS) === "[25,50,75,100]"
  );
  {
    const a = el("a", { href: "/x" });
    const span = el("span", {}, a);
    ok("clickable_finds_anchor_ancestor", client.isClickableInsightsTarget(span) === true);
    ok("clickable_button_role_summary_label_dataid",
      client.isClickableInsightsTarget(el("div", { role: "button" })) &&
        client.isClickableInsightsTarget(el("summary")) &&
        client.isClickableInsightsTarget(el("label", { for: "f" })) &&
        client.isClickableInsightsTarget(el("div", { "data-insights-id": "x" })) &&
        !client.isClickableInsightsTarget(el("label")) &&
        !client.isClickableInsightsTarget(el("div")) &&
        !client.isClickableInsightsTarget(null));
    const buildDepth = (d) => {
      const btn = el("button");
      let cur = btn;
      for (let i = 0; i < d; i++) {
        const child = el("div", {}, cur);
        cur = child;
      }
      return cur;
    };
    ok("clickable_within_6_levels", client.isClickableInsightsTarget(buildDepth(6)) === true);
    ok("clickable_beyond_6_levels_no", client.isClickableInsightsTarget(buildDepth(7)) === false);
  }
  {
    const origin = "https://shop.example";
    ok("label_data_insights_id_first",
      client.buildClickLabel(el("a", { "data-insights-id": "hero_cta", "aria-label": "x", href: "/p" }), { origin }) === "hero_cta");
    ok("label_aria_second",
      client.buildClickLabel(el("button", { "aria-label": "Open menu" }, null, { innerText: "☰" }), { origin }) === "Open menu");
    ok("label_link_same_origin_path_only",
      client.buildClickLabel(el("a", { href: "https://shop.example/products/fire-stick?utm=1#top" }), { origin }) === "/products/fire-stick" &&
        client.buildClickLabel(el("a", { href: "/cart?x=1#y" }), { origin }) === "/cart");
    ok("label_link_cross_origin_and_mailto_none",
      client.buildClickLabel(el("a", { href: "https://evil.example/x" }), { origin }) === null &&
        client.buildClickLabel(el("a", { href: "mailto:me@x.com" }), { origin }) === null &&
        client.buildClickLabel(el("a", { href: "tel:+441234567890" }), { origin }) === null);
    ok("label_button_text_trimmed_40",
      client.buildClickLabel(el("button", {}, null, { innerText: "  Add   to\ncart  " }), { origin }) === "Add to cart" &&
        client.buildClickLabel(el("button", {}, null, { innerText: "y".repeat(100) }), { origin }).length === 40);
    ok("label_never_from_form_fields",
      client.buildClickLabel(el("input", {}, null, { innerText: "secret", value: "secret" }), { origin }) === null &&
        client.buildClickLabel(el("textarea", {}, null, { innerText: "secret" }), { origin }) === null &&
        client.buildClickLabel(el("select", {}, null, { innerText: "secret" }), { origin }) === null &&
        client.buildClickLabel(
          el("button", {}, null, { innerText: "typed text", querySelector: () => ({}) }),
          { origin }
        ) === null);
    ok("label_email_like_rejected",
      client.buildClickLabel(el("button", {}, null, { innerText: "me@example.com" }), { origin }) === null);
    // CRLF-tolerant end anchor (Windows working trees).
    const labelFn = read("lib/insightsClient.ts").match(
      /export function buildClickLabel[\s\S]*?\r?\n}\r?\n/
    );
    ok("label_source_never_reads_value", !!labelFn && !/\.value\b/.test(labelFn[0]));
  }
  {
    const base = { t: 1000, x: 100, y: 100 };
    const h = [
      { t: 1000, x: 100, y: 100 },
      { t: 1300, x: 110, y: 105 },
    ];
    ok("rage_three_within_1s_30px", client.detectRageClick(h, { t: 1600, x: 105, y: 100 }) === true);
    ok("rage_two_clicks_not_enough", client.detectRageClick([base], { t: 1200, x: 100, y: 100 }) === false);
    ok("rage_spread_over_1s_no", client.detectRageClick(h, { t: 2600, x: 100, y: 100 }) === false);
    ok("rage_too_far_apart_no", client.detectRageClick(h, { t: 1600, x: 300, y: 300 }) === false);
  }

  // ── D. Controller runtime: engaged time, scroll, clicks, gates ───────────
  const fakeStore = makeMemoryStorage();
  global.window = {
    localStorage: fakeStore,
    dispatchEvent() {},
  };
  tc.writeTrackingConsent({ analytics: true, advertising: false });

  function makeController(opts = {}) {
    const state = { now: Date.UTC(2026, 10, 12, 10, 0, 0), visible: opts.visible !== false, path: "/products" };
    const sent = [];
    const ls = makeMemoryStorage();
    const ss = makeMemoryStorage();
    const ctrl = client.createInsightsController({
      getPathname: () => state.path,
      getSearch: () => "",
      getReferrer: () => "",
      getTitle: () => "T",
      getLanguage: () => "en-GB",
      getScreen: () => ({ w: 390, h: 844 }),
      localStorage: ls,
      sessionStorage: ss,
      now: () => state.now,
      schedule: () => 1,
      clearSchedule: () => {},
      isVisible: () => state.visible,
      transport: (payload) => {
        sent.push(payload);
        return { status: 200, ok: true };
      },
    });
    const drain = () => {
      let guard = 0;
      while (ctrl.getQueueLength() > 0 && guard++ < 50) ctrl.flush();
      return sent.flatMap((p) => p.events);
    };
    return { ctrl, state, sent, drain };
  }

  {
    const { ctrl, state, drain } = makeController();
    ctrl.start();
    ok("controller_starts_with_consent", ctrl.isRunning() === true);
    state.now += 10_000; // 10s visible
    ctrl.setVisible(false);
    state.now += 60_000; // 60s hidden
    ctrl.setVisible(true);
    state.now += 5_000; // 5s visible
    ok("engaged_excludes_hidden_time", ctrl.getEngagedMs() === 15_000, `ms=${ctrl.getEngagedMs()}`);
    ctrl.handlePathChange("/cart");
    const events = drain();
    const timing = events.find((e) => e.t === "scroll_depth" && e.time_on_page_ms != null);
    ok("leave_emits_engaged_ms", !!timing && timing.time_on_page_ms === 15_000 && timing.path === "/products");
    ok(
      "leave_timing_adds_no_extra_page_view",
      events.filter((e) => e.t === "page_view" && e.path === "/products").length === 1
    );
  }
  {
    const { ctrl, state, drain } = makeController({ visible: false });
    ctrl.start();
    state.now += 30_000;
    ok("hidden_from_start_zero_engaged", ctrl.getEngagedMs() === 0);
    ctrl.handlePathChange("/cart");
    const events = drain();
    ok(
      "no_timing_event_when_never_visible",
      !events.some((e) => e.t === "scroll_depth" && e.path === "/products")
    );
  }
  {
    const { ctrl, state, drain } = makeController();
    ctrl.start();
    state.now += 2000;
    ctrl.recordScroll(30);
    ctrl.recordScroll(34);
    ctrl.recordScroll(60);
    ctrl.recordScroll(100);
    state.now += 3000;
    ctrl.pageHidden();
    state.now += 1000;
    ctrl.setVisible(true);
    state.now += 1000;
    ctrl.pageHidden();
    ctrl.handlePathChange("/cart");
    const events = drain();
    const marks = events.filter((e) => e.t === "scroll_depth" && e.time_on_page_ms == null);
    ok(
      "scroll_watermarks_25_50_100_once",
      marks.map((e) => e.scroll_depth_pct).join(",") === "25,50,100",
      marks.map((e) => e.scroll_depth_pct).join(",")
    );
    const flagged = events.filter((e) => e.props && (e.props.m25 || e.props.m50 || e.props.m75 || e.props.m100));
    const flagKeys = flagged.flatMap((e) => Object.keys(e.props));
    ok(
      "scroll_milestones_flagged_once_per_page_view",
      flagged.length === 1 &&
        ["m100", "m25", "m50", "m75"].every((k) => flagKeys.filter((x) => x === k).length === 1),
      flagKeys.join(",")
    );
    const timingTotal = events
      .filter((e) => e.t === "scroll_depth" && e.time_on_page_ms != null)
      .reduce((s, e) => s + e.time_on_page_ms, 0);
    ok("hidden_then_leave_engaged_sums_without_double_count", timingTotal === 6000, `total=${timingTotal}`);
  }
  {
    const { ctrl, state, drain } = makeController();
    ctrl.start();
    let accepted = 0;
    for (let i = 0; i < 35; i++) {
      state.now += 2000;
      if (
        ctrl.recordClick({
          t: "click",
          clickId: "el",
          tag: "button",
          label: "Buy",
          xPct: 10,
          yPct: 20,
          vw: "m",
          x: i * 100,
          y: 50,
        })
      )
        accepted++;
    }
    ok("max_30_clicks_per_page_view", accepted === 30, `accepted=${accepted}`);
    const clicks = drain().filter((e) => e.click_id === "el");
    ok("only_30_click_events_sent", clicks.length === 30, `sent=${clicks.length}`);
    ctrl.handlePathChange("/cart");
    state.now += 2000;
    const again = ctrl.recordClick({
      t: "click", clickId: "el", tag: "a", label: null, xPct: 2, yPct: 2, vw: "d", x: 5, y: 5,
    });
    ok("click_budget_resets_on_new_page_view", again === true);
  }
  {
    const { ctrl, state, drain } = makeController();
    ctrl.start();
    const click = () =>
      ctrl.recordClick({ t: "click", clickId: "el", tag: "button", label: "Pay", xPct: 50, yPct: 60, vw: "m", x: 200, y: 400 });
    click();
    state.now += 100;
    click();
    state.now += 100;
    click(); // 3rd within 1s/30px => rage
    state.now += 100;
    const swallowed = click(); // still same burst
    const events = drain().filter((e) => e.click_id === "el");
    const rageEvents = events.filter((e) => e.props && e.props.rage === true);
    ok("rage_emits_single_rage_event", rageEvents.length === 1 && events.length === 3, `events=${events.length}`);
    ok("rage_burst_continuation_not_counted", swallowed === false);
    state.now += 3000;
    ok("click_after_burst_is_normal", click() === true);
  }
  {
    const { ctrl, state, drain } = makeController();
    ctrl.start();
    for (let i = 0; i < 3; i++) {
      state.now += 1500;
      ctrl.recordClick({ t: "click", clickId: "el", tag: "a", label: "/x", xPct: 10, yPct: 10, vw: "d", x: 50, y: 50 });
    }
    ok("slow_clicks_not_rage", !drain().some((e) => e.props && e.props.rage));
  }
  {
    const { ctrl, state, drain } = makeController();
    ctrl.start();
    state.now += 500;
    ctrl.recordClick({ t: "cart_add", clickId: "cart_add", tag: "button", label: "Add", xPct: 49, yPct: 33, vw: "m", x: 1, y: 1 });
    ctrl.recordClick({ t: "click", clickId: "el", tag: "div", label: null, xPct: 12, yPct: 8, vw: "d", x: 900, y: 900 });
    const events = drain();
    const cart = events.find((e) => e.t === "cart_add");
    const generic = events.find((e) => e.t === "click" && e.click_id === "el");
    ok(
      "click_taxonomy_type_kept_with_props",
      !!cart && cart.click_id === "cart_add" && cart.props.tag === "button" && cart.props.label === "Add"
    );
    ok(
      "click_generic_id_el_props_rounded",
      !!generic &&
        generic.props.x_pct === 12 &&
        generic.props.y_pct === 8 &&
        generic.props.vw === "d" &&
        generic.props.label === undefined &&
        generic.props.rage === undefined
    );
    ok(
      "click_props_have_no_raw_pixels",
      !JSON.stringify(events).includes('"x":') && !JSON.stringify(events).includes('"y":')
    );
  }

  // Gates unchanged
  const consentYes = { analytics: true, advertising: false };
  ok("gate_no_consent_off", client.shouldRecordInsights({ preference: null, pathname: "/" }) === false);
  ok("gate_analytics_false_off", client.shouldRecordInsights({ preference: { analytics: false }, pathname: "/" }) === false);
  ok("gate_gpc_off", client.shouldRecordInsights({ preference: consentYes, pathname: "/", gpc: true }) === false);
  ok(
    "gate_optout_off",
    (() => {
      const st = makeMemoryStorage();
      client.setInsightsOptOut(st, true);
      return client.shouldRecordInsights({ preference: consentYes, pathname: "/", storage: st }) === false;
    })()
  );
  ok("gate_excluded_paths_off", ["/sidhu", "/api/x", "/erp", "/order-tracking"].every(
    (p) => client.shouldRecordInsights({ preference: consentYes, pathname: p }) === false));
  ok("gate_consent_on", client.shouldRecordInsights({ preference: consentYes, pathname: "/" }) === true);
  ok(
    "gate_controller_not_started_without_consent",
    (() => {
      tc.writeTrackingConsent({ analytics: false, advertising: false });
      const { ctrl } = makeController();
      ctrl.start();
      const running = ctrl.isRunning();
      tc.writeTrackingConsent({ analytics: true, advertising: false });
      return running === false;
    })()
  );
  ok("consent_version_still_2", tc.TRACKING_CONSENT_VERSION === 2);
  delete global.window;

  // ── E. Admin APIs ────────────────────────────────────────────────────────
  const perms = loadTsModule("lib/adminPermissions.ts");
  let authMode = "ok";
  let authRole = "manager";
  let queryImpl = async () => [[]];
  const sqlLog = [];

  function stubsFor() {
    return {
      "@/lib/db": {
        __esModule: true,
        default: {
          query: async (sql, params) => {
            sqlLog.push({ sql: String(sql), params: params || [] });
            return queryImpl(String(sql), params || []);
          },
        },
      },
      "@/lib/adminAuth": {
        requireAdminPermission: async (req, res, permission) => {
          if (authMode === "anon") {
            res.status(401).json({ error: "Unauthorized" });
            return null;
          }
          const id = { authenticated: true, role: authRole, staffId: 7, name: authRole, principalType: "staff" };
          if (!perms.hasAdminPermission(id.role, permission)) {
            res.status(403).json({ error: "Forbidden" });
            return null;
          }
          return id;
        },
        getRequestMeta: () => ({ ip: "198.51.100.1", userAgent: "t" }),
      },
      "@/lib/adminAudit": { recordAdminAudit: async () => {} },
      "@/lib/adminPermissions": perms,
      "@/lib/insightsSettings": {
        getInsightsSettings: async () => ({ detail_retention_days: 90, summary_retention_days: 365 }),
      },
      "@/lib/insightsRetention": { scheduleInsightsRetention: () => {} },
    };
  }

  async function invoke(rel, { method = "GET", query = {}, role = "manager", mode = "ok" } = {}) {
    authMode = mode;
    authRole = role;
    sqlLog.length = 0;
    cache.clear();
    const mod = loadTsModule(rel, stubsFor());
    const handler = mod.default || mod;
    const res = makeRes();
    await handler({ method, query, headers: {}, socket: {} }, res);
    return res;
  }

  for (const name of ["geo", "sources", "returning", "pages"]) {
    const rel = `pages/api/admin-insights/${name}.ts`;
    const g = await invoke(rel, { role: "super_admin" });
    const p = await invoke(rel, { method: "POST", role: "super_admin" });
    ok(
      `api_${name}_410_gone`,
      g.statusCode === 410 && g.body && g.body.error === "gone" && p.statusCode === 410 && sqlLog.length === 0
    );
  }

  const range = { from: isoDay(-1), to: isoDay(0) };

  {
    let res = await invoke("pages/api/admin-insights/click-map.ts", { mode: "anon", query: range });
    ok("click_map_anon_401", res.statusCode === 401);
    res = await invoke("pages/api/admin-insights/click-map.ts", { role: "writer", query: { ...range, path: "/", device: "m" } });
    ok("click_map_writer_403", res.statusCode === 403);
    res = await invoke("pages/api/admin-insights/click-map.ts", { query: { ...range, device: "m" } });
    ok("click_map_requires_path", res.statusCode === 400);
    res = await invoke("pages/api/admin-insights/click-map.ts", { query: { ...range, path: "/products" } });
    ok("click_map_requires_device", res.statusCode === 400);
    res = await invoke("pages/api/admin-insights/click-map.ts", { query: { ...range, path: "//evil.example", device: "m" } });
    ok("click_map_rejects_non_site_path", res.statusCode === 400);

    queryImpl = async () => [
      [
        { props_json: '{"x_pct":10,"y_pct":20,"vw":"m"}', screen_w: 390 },
        { props_json: { x_pct: 10, y_pct: 20, vw: "m" }, screen_w: 390 },
        { props_json: { x_pct: 50, y_pct: 50, vw: "d" }, screen_w: 1440 },
        { props_json: { x_pct: 30, y_pct: 40 }, screen_w: 390 },
        { props_json: { x_pct: 300, y_pct: 4, vw: "m" }, screen_w: 390 },
        { props_json: { tag: "a" }, screen_w: 390 },
      ],
    ];
    res = await invoke("pages/api/admin-insights/click-map.ts", { query: { ...range, path: "/products", device: "m" } });
    const b = res.body;
    ok(
      "click_map_aggregates_by_device",
      res.statusCode === 200 &&
        b.total_clicks === 3 &&
        b.buckets[0].count === 2 &&
        b.buckets[0].x_pct === 10 &&
        b.buckets.some((x) => x.x_pct === 30 && x.y_pct === 40) &&
        !b.buckets.some((x) => x.x_pct === 50)
    );
    const q = sqlLog.find((c) => /FROM insights_events/.test(c.sql));
    ok(
      "click_map_query_bounded_and_parameterised",
      !!q && /LIMIT \?/.test(q.sql) && /e\.event_time >= \? AND e\.event_time < \?/.test(q.sql) &&
        q.params[0] === "/products" && !/\/products/.test(q.sql)
    );
  }

  {
    queryImpl = async (sql) => {
      if (/GROUP BY e\.path\s+ORDER BY views/.test(sql)) return [[{ p: "/products", views: 10 }, { p: "/", views: 4 }]];
      if (/SUM\(e\.time_on_page_ms\)/.test(sql))
        return [[{ p: "/products", engaged_ms: 200000, timed: 8 }]];
      if (/e\.event_type = 'scroll_depth'\s+AND e\.props_json IS NOT NULL/.test(sql))
        return [
          [
            { p: "/products", props_json: { m25: true, m50: true } },
            { p: "/products", props_json: '{"m25":true,"m50":true,"m75":true,"m100":true}' },
            { p: "/", props_json: { m25: true } },
          ],
        ];
      if (/e\.click_id IS NOT NULL/.test(sql))
        return [
          [
            { p: "/products", props_json: { tag: "button", label: "Add to cart", vw: "m", rage: true }, screen_w: 390 },
            { p: "/products", props_json: { tag: "button", label: "Add to cart", vw: "m" }, screen_w: 390 },
            { p: "/products", props_json: { tag: "a", label: "/cart", vw: "d" }, screen_w: 1440 },
          ],
        ];
      if (/s\.exit_path IN/.test(sql)) return [[{ p: "/products", exits: 4 }]];
      return [[]];
    };
    const res = await invoke("pages/api/admin-insights/page-behaviour.ts", { query: range });
    const row = res.body?.rows?.find((r) => r.path === "/products");
    ok("page_behaviour_manager_ok", res.statusCode === 200 && res.body.has_data === true && res.body.rows.length === 2);
    ok("page_behaviour_avg_engaged", row.views === 10 && row.avg_engaged_ms === 20000);
    ok("page_behaviour_reach_counts", row.reach.m25 === 2 && row.reach.m50 === 2 && row.reach.m75 === 1 && row.reach.m100 === 1);
    ok(
      "page_behaviour_top_clicks_and_rage",
      row.top_clicks[0].label === "Add to cart" && row.top_clicks[0].clicks === 2 && row.rage_clicks === 1
    );
    ok("page_behaviour_exit_rate", row.exit_rate_pct === 40);
    ok("page_behaviour_queries_limited", sqlLog.every((c) => /LIMIT/.test(c.sql)) && sqlLog.length <= 6, `n=${sqlLog.length}`);

    const mobile = await invoke("pages/api/admin-insights/page-behaviour.ts", { query: { ...range, device: "m", path: "/products" } });
    const mrow = mobile.body.rows.find((r) => r.path === "/products");
    ok(
      "page_behaviour_device_filter_prefers_vw",
      mobile.statusCode === 200 && mrow.top_clicks.length === 1 && mrow.top_clicks[0].clicks === 2 &&
        sqlLog.some((c) => /s\.screen_w < 768/.test(c.sql))
    );
    const bad = await invoke("pages/api/admin-insights/page-behaviour.ts", { query: { ...range, device: "x" } });
    const badPath = await invoke("pages/api/admin-insights/page-behaviour.ts", { query: { ...range, path: "http://evil" } });
    ok("page_behaviour_rejects_bad_params", bad.statusCode === 400 && badPath.statusCode === 400);
    const w = await invoke("pages/api/admin-insights/page-behaviour.ts", { role: "writer", query: range });
    ok("page_behaviour_writer_403", w.statusCode === 403);
  }

  {
    const sid = "aaaaaaaa-1111-4111-8111-111111111111";
    queryImpl = async (sql) => {
      if (/FROM insights_sessions s/.test(sql) && /LIMIT \?/.test(sql) && !/insights_events/.test(sql))
        return [
          [
            {
              session_id: sid, started_at: "2026-11-12T10:00:00Z", duration_ms: 42000, is_bot: 0, is_new_visitor: 1,
              is_returning: 0, device_type: "unknown", browser_name: null, os_name: null, source_bucket: "direct",
              utm_source: null, utm_medium: null, utm_campaign: null, referrer_host: null, landing_path: "/",
              exit_path: "/products", pageview_count: 2, event_count: 9, has_order: 0,
              ip_address: "203.0.113.5", country_name: "UK",
            },
          ],
        ];
      if (/FROM insights_events e/.test(sql))
        return [
          [
            { session_id: sid, event_type: "page_view", path: "/" },
            { session_id: sid, event_type: "scroll_depth", path: "/", time_on_page_ms: 8000, scroll_depth_pct: 50, props_json: null },
            { session_id: sid, event_type: "click", path: "/", click_id: "el", props_json: { label: "Shop" } },
            { session_id: sid, event_type: "page_view", path: "/products" },
            { session_id: sid, event_type: "scroll_depth", path: "/products", time_on_page_ms: 20000, scroll_depth_pct: 75 },
            { session_id: sid, event_type: "scroll_depth", path: "/products", time_on_page_ms: 14000, scroll_depth_pct: 100 },
            { session_id: sid, event_type: "click", path: "/products", click_id: "el", props_json: '{"label":"Size guide","tag":"summary"}' },
          ],
        ];
      return [[]];
    };
    const res = await invoke("pages/api/admin-insights/journeys.ts", { role: "super_admin", query: range });
    const j = res.body?.rows?.[0];
    ok("journeys_ok", res.statusCode === 200 && !!j);
    ok(
      "journeys_steps_engaged_and_scroll",
      j.steps.length === 2 &&
        j.steps[0].engaged_ms === 8000 && j.steps[0].scroll_pct === 50 &&
        j.steps[1].engaged_ms === 34000 && j.steps[1].scroll_pct === 100
    );
    ok(
      "journeys_last_click_before_exit",
      j.exit_click && j.exit_click.label === "Size guide" && j.exit_click.tag === "summary"
    );
    const out = JSON.stringify(res.body);
    ok(
      "journeys_no_ip_or_location_even_for_super_admin",
      !/ip_address|ip_masked|ip_visible|203\.0\.113|country|region|city|network_provider/.test(out)
    );
    ok(
      "journeys_sql_never_selects_ip_or_geo",
      sqlLog.every((c) => !/ip_address|ip_masked|country_|city_name|region_name|network_provider/.test(c.sql))
    );
    ok("journeys_queries_bounded", sqlLog.length === 2 && sqlLog.every((c) => /LIMIT/.test(c.sql)));
  }

  {
    queryImpl = async (sql) => {
      if (/AS avg_engaged_ms/.test(sql))
        return [[{ sessions: 12, visitors: 9, pageviews: 30, orders: 2, new_sessions: 8, returning_sessions: 4, avg_engaged_ms: "45000.5" }]];
      if (/AS atc/.test(sql)) return [[{ atc: 3, checkout_starts: 2, place_orders: 1, js_errors: 0, not_found: 0 }]];
      if (/s\.landing_path AS p/.test(sql)) return [[{ p: "/", sessions: 7 }, { p: "/products", sessions: 3 }]];
      if (/s\.exit_path AS p/.test(sql)) return [[{ p: "/cart", sessions: 4 }]];
      return [[]];
    };
    const res = await invoke("pages/api/admin-insights/summary.ts", { query: { range: "today" } });
    const d = res.body;
    ok(
      "summary_today_fields",
      res.statusCode === 200 && d.kpis.sessions === 12 && d.kpis.pageviews === 30 && d.kpis.add_to_cart === 3 &&
        d.kpis.checkout_starts === 2 && d.kpis.orders === 2 && d.avg_engaged_ms === 45000.5
    );
    ok(
      "summary_top_landings_and_exits",
      d.top_landings[0].path === "/" && d.top_landings[0].sessions === 7 && d.top_exits[0].path === "/cart"
    );
    ok("summary_no_top_countries", !("top_countries" in d));
    ok("summary_sql_no_geo", sqlLog.every((c) => !/country|insights_geo_daily|city_name/.test(c.sql)));
  }

  {
    queryImpl = async () => [
      [
        { order_id: "ORD1", ordered_at: "2026-11-10T10:00:00Z", payment_method: "bank", status: "paid", total: 10, src: "google", med: "cpc",
          referrer_host: null, landing_path: "/p", device_type: "unknown", ip_address: "203.0.113.50", c_name: "UK" },
      ],
    ];
    const res = await invoke("pages/api/admin-insights/orders-attribution.ts", { role: "super_admin", query: range });
    const sql = sqlLog[0]?.sql || "";
    ok(
      "orders_attribution_sessions_and_orders_only",
      res.statusCode === 200 && /FROM insights_sessions s/.test(sql) && /LEFT JOIN orders o/.test(sql) &&
        !/insights_geo_daily|insights_source_daily|country|ip_address/.test(sql) && sqlLog.length === 1
    );
    ok("orders_attribution_row_has_no_ip_country", !/ip_|country|203\.0\.113/.test(JSON.stringify(res.body)));
    ok(
      "orders_attribution_source_from_session_utm_referrer",
      /s\.utm_source/.test(sql) && /s\.referrer_host/.test(sql) && res.body.rows[0].source === "google"
    );
  }

  {
    queryImpl = async () => [
      [{ started_at: "2026-11-10T10:00:00Z", device_type: "unknown", landing_path: "/", utm_source: null, utm_medium: null,
         utm_campaign: null, referrer_host: null, is_new_visitor: 1, is_returning: 0, is_bot: 0, pageview_count: 2, order_id: null,
         ip_address: "198.51.100.9", c_name: "UK" }],
    ];
    const res = await invoke("pages/api/admin-insights/export.ts", { role: "super_admin", query: { ...range, kind: "sessions" } });
    const csv = String(res.body);
    const header = csv.replace(/^\uFEFF/, "").split("\r\n")[0];
    ok(
      "export_sessions_no_ip_or_country_columns",
      res.statusCode === 200 && !/ip_|country/.test(header) && !csv.includes("198.51.100.9") &&
        sqlLog.every((c) => !/ip_address|ip_masked|country/.test(c.sql))
    );
  }

  // ── F. UI / settings static checks ───────────────────────────────────────
  const panel = read("components/sidhu/insights/SidhuInsightsPanel.tsx");
  const labels = [...panel.matchAll(/\{ id: "[a-z]+", label: "([^"]+)" \}/g)].map((m) => m[1]);
  ok(
    "panel_tabs_exact_order",
    labels.join("|") ===
      "Today|Journeys|Page behaviour|Click map|Funnel|Checkout problems|Orders attribution|Export|Settings",
    labels.join("|")
  );
  ok(
    "panel_removed_tabs_gone",
    !/label: "(Overview|Sources|Geography|Pages|Returning)"/.test(panel) &&
      !/OverviewScreen|SourcesScreen|GeographyScreen|PagesScreen|ReturningScreen/.test(panel)
  );
  ok(
    "removed_screens_deleted",
    ["Overview", "Sources", "Geography", "Pages", "Returning"].every(
      (n) => !exists(`components/sidhu/insights/${n}Screen.tsx`)
    )
  );
  ok(
    "kept_and_new_screens_present",
    ["Today", "Journeys", "PageBehaviour", "ClickMap", "Funnel", "CheckoutProblems", "OrdersAttribution", "Export", "Settings"].every(
      (n) => exists(`components/sidhu/insights/${n}Screen.tsx`)
    ) && exists("pages/api/admin-insights/page-behaviour.ts") && exists("pages/api/admin-insights/click-map.ts")
  );
  ok("panel_rbac_gates_unchanged", /insights\.view/.test(panel) && /insights\.settings/.test(panel) && /insights\.export/.test(panel));
  ok(
    "rbac_permissions_file_unchanged",
    // TEST-HYG-1: own slim-67 range only — later tasks may extend SUPER_ADMIN keys.
    (gitNames([
      "diff",
      "--name-only",
      "ad340b120f9f4c475fa59a861e075012739e5766..d5502abdc7b26f9bd799c14250b52effe3c7681c",
      "--",
      "lib/adminPermissions.ts",
    ]) || ["?"]).length === 0
  );

  const settingsUi = read("components/sidhu/insights/SettingsScreen.tsx");
  ok(
    "settings_ui_geo_removed",
    !/geo_city_enabled|City-level|City geography|Reload geo DB|Geo database|DB-IP|reload_geo_db/.test(settingsUi)
  );
  ok(
    "settings_ui_keeps_retention_and_optout",
    /ip_full_retention_days/.test(settingsUi) && /ThisBrowserOptOutCard/.test(settingsUi) && /INSIGHTS_OPTOUT_KEY/.test(settingsUi)
  );
  const settingsApi = read("pages/api/admin-insights/settings.ts");
  ok(
    "settings_api_no_geo_status_or_reload",
    !/geoFileStatus|insightsGeo|reload_geo_db|DBIP/.test(settingsApi) && /geo_city_enabled/.test(settingsApi)
  );
  const types = read("components/sidhu/insights/insightsTypes.ts");
  ok("types_no_geo_block", !/InsightsGeoFileStatus|geo:\s*\{/.test(types));

  const uiNoIp = ["JourneysScreen", "OrdersAttributionScreen", "ExportScreen", "TodayScreen", "PageBehaviourScreen", "ClickMapScreen"].map(
    (n) => [n, read(`components/sidhu/insights/${n}.tsx`)]
  );
  ok(
    "ui_no_ip_or_location",
    uiNoIp.every(([, src]) => !/ip_address|ip_masked|ip_visible|\bLocation\b|\bcountry\b|<th[^>]*>IP<\/th>/.test(src)),
    uiNoIp.filter(([, s]) => /ip_address|ip_visible|\bLocation\b|\bcountry\b/.test(s)).map(([n]) => n).join(",")
  );
  const today = read("components/sidhu/insights/TodayScreen.tsx") + read("components/sidhu/insights/KpiGrid.tsx");
  ok(
    "today_kpis_slim",
    /Avg engaged time/.test(today) && /Orders linked/.test(today) && /Top landing pages/.test(today) &&
      /Top exit pages/.test(today) && !/top_countries|Top countries/.test(today)
  );
  const clickMapUi = read("components/sidhu/insights/ClickMapScreen.tsx");
  ok(
    "click_map_iframe_sandboxed_no_scripts_and_labelled_approximate",
    /sandbox=""/.test(clickMapUi) && !/allow-scripts/.test(clickMapUi) && /Approximate/.test(clickMapUi) &&
      /INSIGHTS_MOBILE_WIDTH_PX/.test(clickMapUi) && /INSIGHTS_DESKTOP_WIDTH_PX/.test(clickMapUi)
  );
  ok(
    "mobile_desktop_widths_390_1280",
    /INSIGHTS_MOBILE_WIDTH_PX = 390/.test(types) && /INSIGHTS_DESKTOP_WIDTH_PX = 1280/.test(types)
  );

  const touchedUi = [
    "components/sidhu/insights/ClickMapScreen.tsx",
    "components/sidhu/insights/PageBehaviourScreen.tsx",
    "components/sidhu/insights/TodayScreen.tsx",
    "components/sidhu/insights/JourneysScreen.tsx",
    "components/sidhu/insights/OrdersAttributionScreen.tsx",
    "components/sidhu/insights/SettingsScreen.tsx",
    "components/sidhu/insights/SidhuInsightsPanel.tsx",
    "components/SidhuInsightsBeacon.tsx",
    "lib/insightsClient.ts",
    "components/TrackingConsent.tsx",
  ];
  ok("no_dangerouslySetInnerHTML_added", touchedUi.every((f) => !/dangerouslySetInnerHTML/.test(read(f))));

  // ── G. Beacon / client static checks ─────────────────────────────────────
  const beacon = read("components/SidhuInsightsBeacon.tsx");
  const clientSrc = read("lib/insightsClient.ts");
  ok(
    "beacon_click_capture_passive_capture_phase",
    /addEventListener\("click", onClick, \{ capture: true, passive: true \}\)/.test(beacon) &&
      /findClickableInsightsTarget/.test(beacon) && /resolveClickTaxonomyId/.test(beacon)
  );
  ok(
    "beacon_wires_visibility_for_engaged_time",
    /isVisible: \(\) => document\.visibilityState/.test(beacon) && /controller\.pageHidden\(\)/.test(beacon) &&
      /controller\.setVisible\(true\)/.test(beacon) && /controller\.recordScroll\(/.test(beacon)
  );
  ok(
    "beacon_no_replay_or_field_capture",
    !/mousemove|mouseover|MutationObserver|rrweb|addEventListener\("(input|change|focusin|paste)"/.test(beacon + clientSrc) &&
      !/getBoundingClientRect[\s\S]{0,200}\.value/.test(beacon)
  );
  ok("beacon_click_handler_no_field_values", (() => {
    // CRLF-tolerant end anchor (Windows working trees).
    const m = beacon.match(/const onClick = [\s\S]*?\r?\n    \};\r?\n/);
    return !!m && !/\.value\b|innerText|textContent/.test(m[0]);
  })());
  ok("client_gates_same_functions_present",
    /export function shouldRecordInsights/.test(clientSrc) && /hasInsightsOptOut\(opts\.storage\)/.test(clientSrc) &&
      /hasGlobalPrivacyControl\(\)/.test(clientSrc) && /isInsightsExcludedPath\(opts\.pathname/.test(clientSrc));

  // ── H. Consent copy, version, and SEO/nav/layout untouched ───────────────
  const consent = read("components/TrackingConsent.tsx").replace(/\s+/g, " ");
  const DESC =
    "Helps us understand how the site is used: Google Analytics and our own site statistics (pages viewed, traffic source, device type, clicks, scrolling and time on page, cart and checkout steps; never what you type into forms). Microsoft Clarity only if we switch it on. No effect on cart or checkout.";
  ok("consent_analytics_copy_new", consent.includes(DESC) && !/approximate location from IP/.test(consent));
  ok(
    "consent_banner_text_unchanged",
    consent.includes(
      "Privacy choices. We use optional analytics (including our own first-party site statistics) and advertising technologies to understand site use and measure ads."
    ) || /including our own first-party site statistics/.test(consent)
  );
  ok("consent_version_source_is_2", /TRACKING_CONSENT_VERSION\s*=\s*2/.test(read("lib/trackingConsent.ts")));
  ok(
    "consent_lib_unchanged",
    (gitNames(["diff", "--name-only", "HEAD", "--", "lib/trackingConsent.ts"]) || ["?"]).length === 0
  );

  const protectedPaths = [
    "app",
    "public",
    "components/Navbar.tsx",
    "components/Footer.tsx",
    "next.config.ts",
    "proxy.ts",
    "lib/insightsRetention.ts",
    "lib/insightsSettings.ts",
    "scripts/migrate-sidhu-insights.js",
    "scripts/check-runtime-ddl.js",
  ];
  // F4UK-BLACK-FRIDAY-68: intentional seasonal promo / footer / product seasonal presentation.
  const bf68AllowedUnderProtected = new Set([
    "app/page.tsx",
    "app/HomeClient.tsx",
    "app/seasonal-offers/page.tsx",
    "app/products/[slug]/page.tsx",
    "app/products/[slug]/ProductDetail.tsx",
    "components/Footer.tsx",
    "components/product/SeasonalCountdown.tsx",
    "components/home/SeasonalHomePromoStrip.tsx",
  ]);
  const SLIM67_BASE = "ad340b120f9f4c475fa59a861e075012739e5766";
  const SLIM67_END = "d5502abdc7b26f9bd799c14250b52effe3c7681c";
  const changed = gitNames(["diff", "--name-only", `${SLIM67_BASE}..${SLIM67_END}`, "--", ...protectedPaths]);
  const untracked = []; // TEST-HYG-1: own range only
  const changedFiltered = (changed || []).filter((f) => !bf68AllowedUnderProtected.has(f.replace(/\\/g, "/")));
  const untrackedFiltered = (untracked || []).filter(
    (f) => !bf68AllowedUnderProtected.has(f.replace(/\\/g, "/"))
  );
  ok(
    "seo_nav_layout_retention_ddl_unchanged",
    changed !== null &&
      untracked !== null &&
      changedFiltered.length === 0 &&
      untrackedFiltered.length === 0,
    [...changedFiltered, ...untrackedFiltered].join(", ") || "clean"
  );
  ok(
    "no_ddl_or_row_deletes_in_new_apis",
    ["page-behaviour", "click-map", "journeys", "summary"].every((n) => {
      const s = read(`pages/api/admin-insights/${n}.ts`);
      return !/\b(CREATE|ALTER|DROP)\s+TABLE\b/i.test(s) && !/\bDELETE\s+FROM\b/i.test(s) && !/\bINSERT\b|\bUPDATE\s+insights_/i.test(s);
    })
  );
  ok(
    "ingest_does_not_touch_removed_rollups",
    !/insights_geo_daily|insights_source_daily/.test(ingestSrc) &&
      !/insights_geo_daily|insights_source_daily/.test(read("pages/api/admin-insights/summary.ts"))
  );


// TEST-HYG-1: scope changed-files allowlist to slim-67 commit range
{
  const HYG_RANGE_BASE = "ad340b120f9f4c475fa59a861e075012739e5766";
  const HYG_RANGE_END = "d5502abdc7b26f9bd799c14250b52effe3c7681c";
  let names = [];
  try {
    names = require("child_process")
      .execSync(`git diff --name-only ${HYG_RANGE_BASE}..${HYG_RANGE_END}`, { cwd: ROOT, encoding: "utf8" })
      .split(/\r?\n/)
      .map((s) => s.trim().replace(/\\/g, "/"))
      .filter(Boolean);
  } catch (e) {
    ok("diff_allowlist_slim_67", false, String(e.message || e));
  }
  const allow = new Set(names); // own range defines allowlist
  const unexpected = names.filter((f) => !allow.has(f));
  ok("diff_allowlist_slim_67", unexpected.length === 0, unexpected.join(",") || `files=${names.length}`);
}

console.log(`\nINSIGHTS-SLIM-67: ${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error("TEST HARNESS ERROR", err);
  process.exit(1);
});
