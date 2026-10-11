/**
 * AB-5M / AB-5M1A — Decision evidence contracts + persistence tests.
 * Pure contracts + injectable fake DB. No real DB, HTTP, providers, or --apply.
 */
const fs = require("fs");
const path = require("path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

function ok(name, condition, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`PASS  ${name}${detail ? ` — ${detail}` : ""}`);
  } else {
    failed += 1;
    console.error(`FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function read(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

function deepEqual(a, b) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function loadTsModule(rel, stubs = {}) {
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
    if (
      id === "@/lib/db" ||
      id === "./db" ||
      id === "../db" ||
      id.endsWith("/lib/db") ||
      id.endsWith("/db")
    ) {
      return stubs["@/lib/db"] || dbStub;
    }
    if (id.startsWith("@/lib/")) {
      const mapped = id.replace("@/lib/", "lib/") + ".ts";
      if (fs.existsSync(path.join(ROOT, mapped))) {
        return loadTsModule(mapped, stubs);
      }
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const base = path.resolve(path.dirname(path.join(ROOT, rel)), id);
      if (fs.existsSync(base + ".ts")) {
        return loadTsModule(
          path.relative(ROOT, base + ".ts").replace(/\\/g, "/"),
          stubs
        );
      }
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  return sandbox.module.exports && Object.keys(sandbox.module.exports).length
    ? sandbox.module.exports
    : sandbox.exports;
}

const dbStub = {
  __esModule: true,
  default: {
    query: async () => {
      throw new Error("default DB must not run in AB-5M unit fixtures");
    },
  },
};

const contractSrc = read("lib/seoDecisionEvidence.ts");
const serverSrc = read("lib/seoDecisionEvidenceServer.ts");
const migrateSrc = read("scripts/migrate-seo-decision-evidence.js");

const {
  SEO_DECISION_EVIDENCE_MODES,
  SEO_DECISION_OUTCOME_WINDOWS,
  FABRICATED_GSC_METRIC_KEYS,
  MAX_EVIDENCE_DEPTH,
  parseSeoDecisionEvidenceInput,
  parseSeoDecisionOutcomeInput,
  buildSeoDecisionEvidenceInput,
  serializeCanonicalEvidenceJson,
  canonicalizeEvidenceValue,
  canonicalOutcomeEvidenceKey,
  prepareEvidencePayload,
  normalizeJsonSafeEvidence,
  findForbiddenGscMetricKey,
} = loadTsModule("lib/seoDecisionEvidence.ts");

console.log("\nAB-5M / AB-5M1A Decision Evidence Foundation\n");

function validDecisionInput(overrides = {}) {
  return {
    opportunityId: "opp-firestick-wifi-2026",
    topic: "Firestick WiFi tips",
    intent: "informational",
    decisionAction: "NEW_BLOG",
    targetEntityId: null,
    targetUrl: null,
    schedulerEligible: true,
    decisionReasonCodes: ["NO_EXISTING_CONTENT", "NEW_BLOG_EVIDENCE_READY"],
    decisionExplanation: "No existing content; new blog evidence ready.",
    priorityTier: 3,
    priorityClass: "CREATE_NEW",
    uncertainty: "medium",
    uncertaintyReasons: ["limited topical overlap"],
    estimatedCost: "high",
    evidenceMode: "NO_GSC_DEGRADED_MODE",
    baselineEvidence: { source: "deterministic_engine", disposition: "none" },
    decidedAt: "2026-10-11T00:00:00.000Z",
    ...overrides,
  };
}

function refreshDecision(overrides = {}) {
  return validDecisionInput({
    decisionAction: "REFRESH_EXISTING",
    schedulerEligible: false,
    decisionReasonCodes: ["EXISTING_CONTENT_REFRESH"],
    priorityTier: 1,
    priorityClass: "REUSE_EXISTING",
    estimatedCost: "medium",
    targetEntityId: 12,
    targetUrl: "https://firestick4uk.com/blog/wifi",
    ...overrides,
  });
}

// ---------- DECISION CONTRACT ----------
console.log("--- DECISION CONTRACT ---");

{
  const input = validDecisionInput();
  const snapshot = JSON.parse(JSON.stringify(input));
  const parsed = parseSeoDecisionEvidenceInput(input);
  ok("D_accepts_valid_ab3_ab5", parsed.ok === true);
  ok("D_caller_input_unchanged", deepEqual(input, snapshot));
}

ok(
  "D_rejects_invalid_action",
  parseSeoDecisionEvidenceInput(
    validDecisionInput({ decisionAction: "METADATA_EXPERIMENT" })
  ).ok === false
);

ok(
  "D_rejects_invalid_target_url",
  parseSeoDecisionEvidenceInput(
    refreshDecision({ targetUrl: "https://evil.example/blog" })
  ).ok === false
);

ok(
  "D_evidence_modes_exact",
  deepEqual([...SEO_DECISION_EVIDENCE_MODES], [
    "GSC_AVAILABLE",
    "NO_GSC_DEGRADED_MODE",
  ])
);

// ---------- SCHEDULER CONSISTENCY ----------
console.log("--- SCHEDULER CONSISTENCY ---");

ok(
  "S_new_blog_true_accept",
  parseSeoDecisionEvidenceInput(validDecisionInput()).ok === true
);
ok(
  "S_new_blog_false_reject",
  parseSeoDecisionEvidenceInput(
    validDecisionInput({ schedulerEligible: false })
  ).ok === false
);
ok(
  "S_refresh_false_accept",
  parseSeoDecisionEvidenceInput(refreshDecision()).ok === true
);
ok(
  "S_refresh_true_reject",
  parseSeoDecisionEvidenceInput(
    refreshDecision({ schedulerEligible: true })
  ).ok === false
);
ok(
  "S_do_nothing_false_accept",
  parseSeoDecisionEvidenceInput(
    validDecisionInput({
      decisionAction: "DO_NOTHING",
      schedulerEligible: false,
      decisionReasonCodes: ["NO_ACTIONABLE_SIGNAL"],
      priorityTier: 9,
      priorityClass: "NO_ACTION",
      estimatedCost: "none",
    })
  ).ok === true
);
ok(
  "S_reuses_ab3_helper",
  /isAutonomousNewBlogEligible/.test(contractSrc)
);

const otherActions = [
  ["TITLE_META_UPDATE", "METADATA_ONLY", 2, "IMPROVE_EXISTING", "low"],
  ["INTERNAL_LINKS", "INTERNAL_LINK_GAP", 2, "IMPROVE_EXISTING", "low"],
  ["IMAGE", "IMAGE_GAP", 2, "IMPROVE_EXISTING", "medium"],
  ["INDEXING_REVIEW", "INDEXING_REVIEW_REQUIRED", 0, "BLOCKING_TECHNICAL", "low"],
  ["TECHNICAL_FIX", "TECHNICAL_BLOCKER", 0, "BLOCKING_TECHNICAL", "variable"],
  ["HISTORICAL_RECOVERY", "HISTORICAL_RECOVERY_CANDIDATE", 1, "REUSE_EXISTING", "medium"],
];
for (const [action, reason, tier, cls, cost] of otherActions) {
  const base = {
    decisionAction: action,
    decisionReasonCodes: [reason],
    priorityTier: tier,
    priorityClass: cls,
    estimatedCost: cost,
    targetEntityId: 3,
    targetUrl: "https://firestick4uk.com/blog/x",
  };
  ok(
    `S_${action}_false_accept`,
    parseSeoDecisionEvidenceInput(
      validDecisionInput({ ...base, schedulerEligible: false })
    ).ok === true
  );
  ok(
    `S_${action}_true_reject`,
    parseSeoDecisionEvidenceInput(
      validDecisionInput({ ...base, schedulerEligible: true })
    ).ok === false
  );
}

// ---------- GSC SAFETY ----------
console.log("--- GSC SAFETY ---");

function degradedBaseline(baselineEvidence) {
  return parseSeoDecisionEvidenceInput(
    validDecisionInput({ baselineEvidence })
  );
}

ok("G_top_level_impressions_reject", degradedBaseline({ impressions: 0 }).ok === false);
ok(
  "G_nested_impressions_reject",
  degradedBaseline({ metrics: { impressions: 0 } }).ok === false
);
ok(
  "G_deep_clicks_reject",
  degradedBaseline({ a: { b: { clicks: 1 } } }).ok === false
);
ok(
  "G_mixed_case_ctr_reject",
  degradedBaseline({ metrics: { ImPrEsSiOnS: 1 } }).ok === false ||
    degradedBaseline({ metrics: { CtR: 0.1 } }).ok === false
);
ok("G_rank_reject", degradedBaseline({ seo: { rank: 4 } }).ok === false);
ok("G_ranking_reject", degradedBaseline({ seo: { ranking: 4 } }).ok === false);
ok(
  "G_indexingStatus_reject",
  degradedBaseline({ search: { indexingStatus: "indexed" } }).ok === false
);
ok(
  "G_averagePosition_reject",
  degradedBaseline({ search: { averagePosition: 12.4 } }).ok === false
);
ok(
  "G_valid_nested_factual_accept",
  degradedBaseline({
    source: "deterministic_engine",
    match: { disposition: "none", slug: null },
  }).ok === true
);
{
  const gsc = parseSeoDecisionEvidenceInput(
    validDecisionInput({
      evidenceMode: "GSC_AVAILABLE",
      baselineEvidence: { impressions: 120, clicks: 4, ctr: 0.033 },
    })
  );
  ok("G_gsc_available_accepts_supplied_metrics", gsc.ok === true);
  ok(
    "G_gsc_available_does_not_default_missing",
    gsc.ok &&
      gsc.value.baselineEvidence &&
      gsc.value.baselineEvidence.position === undefined
  );
}
ok(
  "G_aliases_include_rank_indexingStatus",
  FABRICATED_GSC_METRIC_KEYS.includes("rank") &&
    FABRICATED_GSC_METRIC_KEYS.includes("indexingStatus")
);
ok(
  "G_find_nested_helper",
  findForbiddenGscMetricKey({ metrics: { clicks: 1 } }) === "clicks"
);

// ---------- CANONICAL REPLAY ----------
console.log("--- CANONICAL REPLAY ---");

{
  const a = serializeCanonicalEvidenceJson({ a: 1, b: 2 }, 4000);
  const b = serializeCanonicalEvidenceJson({ b: 2, a: 1 }, 4000);
  ok("C_object_key_order_equal", a.ok && b.ok && a.json === b.json);
}
{
  const a = serializeCanonicalEvidenceJson(
    { outer: { z: 1, a: { y: 2, x: 3 } } },
    4000
  );
  const b = serializeCanonicalEvidenceJson(
    { outer: { a: { x: 3, y: 2 }, z: 1 } },
    4000
  );
  ok("C_nested_key_order_equal", a.ok && b.ok && a.json === b.json);
}
{
  const a = serializeCanonicalEvidenceJson([1, 2], 4000);
  const b = serializeCanonicalEvidenceJson([2, 1], 4000);
  ok("C_array_order_different", a.ok && b.ok && a.json !== b.json);
}
{
  const k1 = canonicalOutcomeEvidenceKey("NO_GSC_DEGRADED_MODE", {
    note: "no GSC",
    tags: { b: 2, a: 1 },
  });
  const k2 = canonicalOutcomeEvidenceKey("NO_GSC_DEGRADED_MODE", {
    tags: { a: 1, b: 2 },
    note: "no GSC",
  });
  ok("C_replay_key_reordered_equal", k1 === k2);
}
ok(
  "C_canonicalize_sorts",
  deepEqual(canonicalizeEvidenceValue({ b: 1, a: 2 }), { a: 2, b: 1 })
);

// ---------- JSON SAFETY ----------
console.log("--- JSON SAFETY ---");

{
  const cyclic = {};
  cyclic.self = cyclic;
  ok("J_cycle_reject", normalizeJsonSafeEvidence(cyclic).ok === false);
}
ok("J_date_reject", normalizeJsonSafeEvidence(new Date()).ok === false);
ok(
  "J_date_nested_reject",
  prepareEvidencePayload(
    { when: new Date() },
    { evidenceMode: "NO_GSC_DEGRADED_MODE", maxChars: 4000 }
  ).ok === false
);
{
  class Foo {
    constructor() {
      this.x = 1;
    }
  }
  ok("J_class_reject", normalizeJsonSafeEvidence(new Foo()).ok === false);
}
{
  let getterRan = false;
  const risky = {};
  Object.defineProperty(risky, "secret", {
    enumerable: true,
    get() {
      getterRan = true;
      return 1;
    },
  });
  const res = normalizeJsonSafeEvidence(risky);
  ok("J_getter_reject", res.ok === false);
  ok("J_getter_not_executed", getterRan === false);
}
ok("J_nan_reject", normalizeJsonSafeEvidence({ n: NaN }).ok === false);
ok("J_infinity_reject", normalizeJsonSafeEvidence({ n: Infinity }).ok === false);
ok("J_bigint_reject", normalizeJsonSafeEvidence({ n: 1n }).ok === false);
{
  let deep = { v: 1 };
  for (let i = 0; i < MAX_EVIDENCE_DEPTH + 2; i += 1) {
    deep = { nest: deep };
  }
  ok("J_depth_reject", normalizeJsonSafeEvidence(deep).ok === false);
}
{
  const huge = { blob: "x".repeat(5000) };
  ok(
    "J_size_reject",
    prepareEvidencePayload(huge, {
      evidenceMode: "NO_GSC_DEGRADED_MODE",
      maxChars: 4000,
    }).ok === false
  );
}
{
  const input = { source: "ok", nested: { a: 1 } };
  const snapshot = JSON.parse(JSON.stringify(input));
  prepareEvidencePayload(input, {
    evidenceMode: "NO_GSC_DEGRADED_MODE",
    maxChars: 4000,
  });
  ok("J_immutability", deepEqual(input, snapshot));
}

// ---------- OUTCOME CONTRACT ----------
console.log("--- OUTCOME CONTRACT ---");

ok(
  "O_windows_exact",
  deepEqual([...SEO_DECISION_OUTCOME_WINDOWS], [7, 14, 28])
);
ok(
  "O_accepts_7",
  parseSeoDecisionOutcomeInput({
    decisionId: 1,
    windowDays: 7,
    evidenceMode: "NO_GSC_DEGRADED_MODE",
    outcomeEvidence: { note: "manual review — no GSC" },
    observedAt: "2026-10-18T00:00:00.000Z",
  }).ok === true
);
ok(
  "O_rejects_window_30",
  parseSeoDecisionOutcomeInput({
    decisionId: 1,
    windowDays: 30,
    evidenceMode: "NO_GSC_DEGRADED_MODE",
    observedAt: "2026-10-18T00:00:00.000Z",
  }).ok === false
);
ok(
  "O_nested_gsc_reject",
  parseSeoDecisionOutcomeInput({
    decisionId: 1,
    windowDays: 14,
    evidenceMode: "NO_GSC_DEGRADED_MODE",
    outcomeEvidence: { metrics: { averagePosition: 12.4 } },
    observedAt: "2026-10-25T00:00:00.000Z",
  }).ok === false
);

// ---------- HISTORY / MIGRATION STATIC ----------
console.log("--- HISTORY / MIGRATION ---");

ok(
  "H_migration_no_unique_opportunity",
  !/UNIQUE KEY[^\n]*opportunity_id/i.test(migrateSrc)
);
ok("M_default_check_mode", /APPLY \? "APPLY" : "CHECK"/.test(migrateSrc));
ok("M_apply_uses_mutation_opt_in", /requireMutationOptIn/.test(migrateSrc));
{
  const createTables = [...migrateSrc.matchAll(/CREATE TABLE\s+(\w+)/gi)].map(
    (m) => m[1]
  );
  ok(
    "M_exactly_two_tables",
    createTables.length === 2 &&
      createTables.includes("seo_decision_evidence") &&
      createTables.includes("seo_decision_outcomes")
  );
}
ok(
  "M_unique_decision_window",
  /uq_sdo_decision_window\s*\(\s*decision_id\s*,\s*window_days\s*\)/.test(
    migrateSrc
  )
);
ok("M_fk_restrict", /ON DELETE RESTRICT/.test(migrateSrc));
ok("M_no_seed_rows", !/INSERT INTO seo_decision_/i.test(migrateSrc));
ok(
  "M_column_checks",
  /verifyColumns|DECISION_REQUIRED_COLUMNS|information_schema\.columns/i.test(
    migrateSrc
  )
);
ok(
  "M_fk_checks",
  /loadForeignKey|fk_sdo_decision|DELETE_RULE/i.test(migrateSrc)
);
ok(
  "M_incompatible_refuse_apply",
  /APPLY refused: incompatible|incompatible\.length/i.test(migrateSrc)
);
ok("M_check_exits_without_apply", /No changes made/.test(migrateSrc));

// ---------- BOUNDARIES ----------
console.log("--- BOUNDARIES ---");

ok("B_no_openai_contract", !/openai|gemini|OpenAI|seoAi/i.test(contractSrc));
ok("B_no_openai_server", !/openai|gemini|OpenAI|seoAiServer/i.test(serverSrc));
ok(
  "B_no_route_wiring",
  !fs.existsSync(path.join(ROOT, "pages/api/admin-seo-decision-evidence.ts"))
);
ok(
  "B_no_scheduler_worker",
  !/setInterval|cron|worker_threads|child_process/i.test(contractSrc) &&
    !/setInterval|cron|worker_threads|child_process/i.test(serverSrc)
);
ok("B_seoAi_exists", fs.existsSync(path.join(ROOT, "lib/seoAi.ts")));

// ---------- PERSISTENCE + CONCURRENCY ----------
console.log("--- PERSISTENCE / CONCURRENCY ---");

function makeFakeDb(opts = {}) {
  const decisions = [];
  const outcomes = [];
  let nextDecisionId = 1;
  let nextOutcomeId = 1;
  const calls = [];
  let forceDupOnOutcomeInsert = !!opts.forceDupOnOutcomeInsert;

  const conn = {
    query: async (sql, params = []) => {
      calls.push({ sql: String(sql).replace(/\s+/g, " ").trim(), params });
      const s = String(sql);

      if (/INSERT INTO seo_decision_evidence/i.test(s)) {
        const id = nextDecisionId++;
        const row = {
          id,
          opportunity_id: params[0],
          topic: params[1],
          intent: params[2],
          decision_action: params[3],
          target_entity_id: params[4],
          target_url: params[5],
          scheduler_eligible: params[6],
          decision_reason_codes: params[7],
          decision_explanation: params[8],
          priority_tier: params[9],
          priority_class: params[10],
          uncertainty: params[11],
          uncertainty_reasons: params[12],
          estimated_cost: params[13],
          evidence_mode: params[14],
          baseline_evidence: params[15],
          decided_at: params[16],
          created_at: params[16],
        };
        decisions.push(row);
        return [{ insertId: id, affectedRows: 1 }];
      }

      if (/FROM seo_decision_evidence[\s\S]*WHERE id = \?/i.test(s)) {
        const row = decisions.find((d) => d.id === params[0]);
        return [row ? [row] : []];
      }

      if (/FROM seo_decision_evidence[\s\S]*WHERE opportunity_id = \?/i.test(s)) {
        return [
          decisions
            .filter((d) => d.opportunity_id === params[0])
            .slice()
            .reverse(),
        ];
      }

      if (/INSERT INTO seo_decision_outcomes/i.test(s)) {
        if (forceDupOnOutcomeInsert) {
          const err = new Error("Duplicate entry");
          err.code = "ER_DUP_ENTRY";
          err.errno = 1062;
          throw err;
        }
        const dup = outcomes.find(
          (o) => o.decision_id === params[0] && o.window_days === params[1]
        );
        if (dup) {
          const err = new Error("Duplicate entry");
          err.code = "ER_DUP_ENTRY";
          err.errno = 1062;
          throw err;
        }
        const id = nextOutcomeId++;
        const row = {
          id,
          decision_id: params[0],
          window_days: params[1],
          evidence_mode: params[2],
          outcome_evidence: params[3],
          observed_at: params[4],
          created_at: params[4],
        };
        outcomes.push(row);
        return [{ insertId: id, affectedRows: 1 }];
      }

      if (/FROM seo_decision_outcomes[\s\S]*WHERE id = \?/i.test(s)) {
        const row = outcomes.find((o) => o.id === params[0]);
        return [row ? [row] : []];
      }

      if (
        /FROM seo_decision_outcomes[\s\S]*decision_id = \? AND window_days = \?/i.test(
          s
        )
      ) {
        const row = outcomes.find(
          (o) => o.decision_id === params[0] && o.window_days === params[1]
        );
        return [row ? [row] : []];
      }

      if (/FROM seo_decision_outcomes[\s\S]*WHERE decision_id = \?/i.test(s)) {
        return [outcomes.filter((o) => o.decision_id === params[0])];
      }

      throw new Error("unexpected SQL in fake DB: " + s.slice(0, 160));
    },
  };

  return {
    conn,
    decisions,
    outcomes,
    calls,
    seedOutcome(row) {
      outcomes.push(row);
    },
    setForceDup(v) {
      forceDupOnOutcomeInsert = v;
    },
  };
}

async function runPersistenceTests() {
  const { conn, calls, decisions } = makeFakeDb();
  const {
    insertSeoDecisionEvidence,
    listSeoDecisionEvidenceByOpportunityId,
    getSeoDecisionEvidenceById,
    insertSeoDecisionOutcome,
    listSeoDecisionOutcomesByDecisionId,
    SeoDecisionEvidenceError,
  } = loadTsModule("lib/seoDecisionEvidenceServer.ts", {
    "@/lib/db": { __esModule: true, default: conn },
  });

  const d1 = await insertSeoDecisionEvidence(validDecisionInput(), conn);
  ok("P_insert_decision", d1 && d1.id === 1);
  ok(
    "P_parameterized_insert",
    calls.some(
      (c) =>
        /INSERT INTO seo_decision_evidence/i.test(c.sql) &&
        c.params.includes("opp-firestick-wifi-2026")
    )
  );

  const d2 = await insertSeoDecisionEvidence(
    validDecisionInput({
      decisionAction: "DO_NOTHING",
      schedulerEligible: false,
      decisionReasonCodes: ["NO_ACTIONABLE_SIGNAL"],
      priorityTier: 9,
      priorityClass: "NO_ACTION",
      estimatedCost: "none",
      decidedAt: "2026-10-12T00:00:00.000Z",
    }),
    conn
  );
  ok("P_history_same_opportunity", d1.opportunityId === d2.opportunityId);
  ok("P_history_two_rows", decisions.length === 2);
  ok(
    "P_fetch_by_opportunity",
    (await listSeoDecisionEvidenceByOpportunityId(
      "opp-firestick-wifi-2026",
      conn
    )).length === 2
  );
  ok("P_fetch_by_id", !!(await getSeoDecisionEvidenceById(1, conn)));

  const o1 = await insertSeoDecisionOutcome(
    {
      decisionId: 1,
      windowDays: 7,
      evidenceMode: "NO_GSC_DEGRADED_MODE",
      outcomeEvidence: { note: "no GSC", tags: { b: 2, a: 1 } },
      observedAt: "2026-10-18T00:00:00.000Z",
    },
    conn
  );
  ok("P_first_outcome_write", !!o1 && o1.windowDays === 7);

  const replayReordered = await insertSeoDecisionOutcome(
    {
      decisionId: 1,
      windowDays: 7,
      evidenceMode: "NO_GSC_DEGRADED_MODE",
      outcomeEvidence: { tags: { a: 1, b: 2 }, note: "no GSC" },
      observedAt: "2026-10-19T00:00:00.000Z",
    },
    conn
  );
  ok(
    "P_reordered_keys_identical_replay",
    replayReordered.id === o1.id
  );

  const nestedReplay = await insertSeoDecisionOutcome(
    {
      decisionId: 1,
      windowDays: 7,
      evidenceMode: "NO_GSC_DEGRADED_MODE",
      outcomeEvidence: { note: "no GSC", tags: { a: 1, b: 2 } },
      observedAt: "2026-10-20T00:00:00.000Z",
    },
    conn
  );
  ok("P_nested_reordered_identical", nestedReplay.id === o1.id);

  let arrayConflict = null;
  try {
    await insertSeoDecisionOutcome(
      {
        decisionId: 1,
        windowDays: 7,
        evidenceMode: "NO_GSC_DEGRADED_MODE",
        outcomeEvidence: { note: "no GSC", tags: { a: 1, b: 2 }, order: [2, 1] },
        observedAt: "2026-10-21T00:00:00.000Z",
      },
      conn
    );
  } catch (e) {
    arrayConflict = e;
  }
  // First store had no order array — different evidence → conflict
  ok(
    "P_array_order_or_diff_conflict",
    arrayConflict instanceof SeoDecisionEvidenceError &&
      arrayConflict.code === "outcome_conflict"
  );

  // Explicit array-order conflict with seeded same window after clearing path:
  // seed a second decision window 14 with order [1,2], then replay [2,1]
  const o14 = await insertSeoDecisionOutcome(
    {
      decisionId: 1,
      windowDays: 14,
      evidenceMode: "NO_GSC_DEGRADED_MODE",
      outcomeEvidence: { order: [1, 2] },
      observedAt: "2026-10-25T00:00:00.000Z",
    },
    conn
  );
  let arrDiff = null;
  try {
    await insertSeoDecisionOutcome(
      {
        decisionId: 1,
        windowDays: 14,
        evidenceMode: "NO_GSC_DEGRADED_MODE",
        outcomeEvidence: { order: [2, 1] },
        observedAt: "2026-10-26T00:00:00.000Z",
      },
      conn
    );
  } catch (e) {
    arrDiff = e;
  }
  ok(
    "P_array_order_conflict",
    o14 &&
      arrDiff instanceof SeoDecisionEvidenceError &&
      arrDiff.code === "outcome_conflict" &&
      arrDiff.status === 409
  );

  ok(
    "P_list_outcomes",
    (await listSeoDecisionOutcomesByDecisionId(1, conn)).length === 2
  );
  ok(
    "P_no_runtime_ddl",
    !/CREATE\s+TABLE|ALTER\s+TABLE|DROP\s+TABLE|CREATE\s+INDEX/i.test(serverSrc)
  );
  ok("P_shared_pool", /from ["']@\/lib\/db["']/.test(serverSrc));
  ok("P_no_upsert", !/ON DUPLICATE KEY UPDATE/i.test(serverSrc));

  // Concurrent-style: INSERT always throws ER_DUP; SELECT returns existing
  const fake2 = makeFakeDb({ forceDupOnOutcomeInsert: true });
  fake2.seedOutcome({
    id: 99,
    decision_id: 1,
    window_days: 28,
    evidence_mode: "NO_GSC_DEGRADED_MODE",
    outcome_evidence: JSON.stringify(
      canonicalizeEvidenceValue({ note: "same", meta: { b: 1, a: 2 } })
    ),
    observed_at: "2026-11-01T00:00:00.000Z",
    created_at: "2026-11-01T00:00:00.000Z",
  });
  // Need parent decision for insertSeoDecisionOutcome
  fake2.decisions.push({
    id: 1,
    opportunity_id: "opp",
    topic: null,
    intent: null,
    decision_action: "NEW_BLOG",
    target_entity_id: null,
    target_url: null,
    scheduler_eligible: 1,
    decision_reason_codes: '["NO_EXISTING_CONTENT","NEW_BLOG_EVIDENCE_READY"]',
    decision_explanation: "x",
    priority_tier: 3,
    priority_class: "CREATE_NEW",
    uncertainty: "medium",
    uncertainty_reasons: "[]",
    estimated_cost: "high",
    evidence_mode: "NO_GSC_DEGRADED_MODE",
    baseline_evidence: null,
    decided_at: "2026-10-11T00:00:00.000Z",
    created_at: "2026-10-11T00:00:00.000Z",
  });

  const {
    insertSeoDecisionOutcome: insertOutcome2,
    SeoDecisionEvidenceError: Err2,
  } = loadTsModule("lib/seoDecisionEvidenceServer.ts", {
    "@/lib/db": { __esModule: true, default: fake2.conn },
  });

  const concurrentSame = await insertOutcome2(
    {
      decisionId: 1,
      windowDays: 28,
      evidenceMode: "NO_GSC_DEGRADED_MODE",
      outcomeEvidence: { meta: { a: 2, b: 1 }, note: "same" },
      observedAt: "2026-11-02T00:00:00.000Z",
    },
    fake2.conn
  );
  ok(
    "P_concurrent_identical_dup_replay",
    concurrentSame && concurrentSame.id === 99
  );

  let concurrentDiff = null;
  try {
    await insertOutcome2(
      {
        decisionId: 1,
        windowDays: 28,
        evidenceMode: "NO_GSC_DEGRADED_MODE",
        outcomeEvidence: { note: "different" },
        observedAt: "2026-11-03T00:00:00.000Z",
      },
      fake2.conn
    );
  } catch (e) {
    concurrentDiff = e;
  }
  ok(
    "P_concurrent_different_conflict",
    concurrentDiff instanceof Err2 &&
      concurrentDiff.code === "outcome_conflict" &&
      concurrentDiff.status === 409
  );

  // Builder smoke
  const built = buildSeoDecisionEvidenceInput({
    decision: {
      opportunityId: "opp-builder",
      action: "TITLE_META_UPDATE",
      target: {
        entityId: 9,
        url: "https://firestick4uk.com/blog/wifi",
      },
      schedulerEligible: false,
      reasonCodes: ["METADATA_ONLY"],
      explanation: "Title/meta update only.",
    },
    prioritized: {
      opportunityId: "opp-builder",
      action: "TITLE_META_UPDATE",
      priorityTier: 2,
      priorityClass: "IMPROVE_EXISTING",
      uncertainty: "low",
      estimatedCost: "low",
      reviewRequired: false,
      rankable: true,
      target: {
        entityId: 9,
        url: "https://firestick4uk.com/blog/wifi",
      },
      reasonCodes: ["EXISTING_CONTENT_IMPROVEMENT"],
    },
    evidenceMode: "NO_GSC_DEGRADED_MODE",
    topic: "WiFi",
  });
  ok("D_builder_from_stack", built.ok === true);
}

runPersistenceTests()
  .then(() => {
    console.log(`\nAB-5M1A results: ${passed} passed, ${failed} failed\n`);
    process.exit(failed === 0 ? 0 : 1);
  })
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
