/**
 * AB-7B R3 — Authenticated route + runtime tests.
 * Mocked auth/rate-limit/adapters only. No network, DB, real env secrets, or Next server.
 */
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
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

function stripCommentsAndStrings(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "")
    .replace(/(['"`])(?:\\.|(?!\1)[\s\S])*\1/g, '""');
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
    if (id.startsWith("@/lib/")) {
      return loadTsModule("lib/" + id.slice("@/lib/".length) + ".ts", stubs);
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

const runtimeSrc = read("lib/blogGroundedResearchRuntime.server.ts");
const routeSrc = read("pages/api/admin-blog-research.ts");
const seoAiSrc = read("lib/seoAi.ts");
const seoAiServerSrc = read("lib/seoAiServer.ts");
const adminSeoAiSrc = read("pages/api/admin-seo-ai.ts");
const rateLimitSrc = read("lib/rateLimit.ts");

const {
  createBlogGroundedResearchFailure,
  BLOG_GROUNDED_RESEARCH_TASK,
  parseBlogGroundedResearchRequest,
} = loadTsModule("lib/blogGroundedResearchContracts.ts");

function makeRequest(overrides = {}) {
  return {
    provider: "openai",
    task: BLOG_GROUNDED_RESEARCH_TASK,
    opportunityId: "opp-firestick-speed",
    topic: "How to improve Firestick performance safely",
    intent: "informational troubleshooting",
    ...overrides,
  };
}

function makeReadyEvidence(state = "ready") {
  if (state === "ready") {
    return {
      ok: true,
      evidenceState: "ready",
      reasonCodes: ["GROUNDED_EVIDENCE_READY"],
      subject: {
        opportunityId: "opp-firestick-speed",
        topic: "How to improve Firestick performance safely",
        intent: "informational troubleshooting",
      },
      summary: "ok",
      sources: [],
      claims: [],
      unknowns: [],
    };
  }
  return {
    ok: false,
    evidenceState: "missing",
    reasonCodes: ["UNGROUNDED_SOURCE"],
    subject: {
      opportunityId: "opp-firestick-speed",
      topic: "How to improve Firestick performance safely",
      intent: "informational troubleshooting",
    },
    summary: null,
    sources: [],
    claims: [],
    unknowns: [],
  };
}

function makeReadyPacket(provider) {
  return {
    provider,
    providerOutput: {
      summary: "Independent sources support a concise troubleshooting overview.",
      sources: [
        {
          id: "s1",
          title: "Independent Source 1",
          url: "https://source1.example.com/research?item=1",
          publishedAt: "2026-01-10",
        },
        {
          id: "s2",
          title: "Independent Source 2",
          url: "https://source2.example.com/research?item=2",
          publishedAt: null,
        },
      ],
      claims: [
        { claim: "Supported research claim 1", sourceIds: ["s1"] },
        { claim: "Supported research claim 2", sourceIds: ["s2"] },
      ],
      unknowns: ["Device-specific behavior may vary by Fire OS version."],
    },
    grounding: {
      groundedUrls: [
        "https://source1.example.com/research?item=1",
        "https://source2.example.com/research?item=2",
      ],
      searchQueries: ["q1", "q2"],
    },
  };
}

function loadFreshRuntime() {
  // Fresh module instance so concurrency flag is isolated per helper call group.
  return loadTsModule("lib/blogGroundedResearchRuntime.server.ts");
}

console.log("\nAB-7B R3 Grounded Research Route + Runtime\n");

async function main() {
  // ---------- PROVIDER CONFIG ----------
  {
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    let openaiLoads = 0;
    let geminiLoads = 0;
    const result = await runBlogGroundedResearchRuntime(makeRequest(), {
      deps: {
        env: {
          OPENAI_API_KEY: "test-key",
          OPENAI_SEO_MODEL: "gpt-test",
        },
        loadOpenAiAdapter: async () => {
          openaiLoads += 1;
          return {
            callOpenAiGroundedResearch: async () => ({
              ok: true,
              packet: makeReadyPacket("openai"),
            }),
          };
        },
        loadGeminiAdapter: async () => {
          geminiLoads += 1;
          throw new Error("should not load gemini");
        },
      },
    });
    ok(
      "R_openai_configured",
      result.ok === true &&
        result.evidence.evidenceState === "ready" &&
        openaiLoads === 1 &&
        geminiLoads === 0
    );
    ok(
      "R_openai_no_secret_leak",
      !JSON.stringify(result).includes("test-key")
    );
  }

  {
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    let openaiLoads = 0;
    let geminiLoads = 0;
    const result = await runBlogGroundedResearchRuntime(
      makeRequest({ provider: "gemini" }),
      {
        deps: {
          env: {
            GEMINI_API_KEY: "gem-key",
            GEMINI_SEO_MODEL: "gemini-test",
          },
          loadOpenAiAdapter: async () => {
            openaiLoads += 1;
            throw new Error("should not load openai");
          },
          loadGeminiAdapter: async () => {
            geminiLoads += 1;
            return {
              callGeminiGroundedResearch: async (_s, _c, options) => {
                ok(
                  "R_gemini_no_timeoutMs",
                  options == null ||
                    (typeof options === "object" &&
                      !Object.prototype.hasOwnProperty.call(options, "timeoutMs") &&
                      !Object.prototype.hasOwnProperty.call(options, "deps"))
                );
                return { ok: true, packet: makeReadyPacket("gemini") };
              },
            };
          },
        },
      }
    );
    ok(
      "R_gemini_configured",
      result.ok === true &&
        result.provider === "gemini" &&
        openaiLoads === 0 &&
        geminiLoads === 1
    );
  }

  for (const [name, env] of [
    ["openai_missing_key", { OPENAI_SEO_MODEL: "m" }],
    ["openai_missing_model", { OPENAI_API_KEY: "k" }],
    ["openai_whitespace", { OPENAI_API_KEY: "  ", OPENAI_SEO_MODEL: "  " }],
    ["gemini_missing_key", { GEMINI_SEO_MODEL: "m" }],
    ["gemini_missing_model", { GEMINI_API_KEY: "k" }],
    ["gemini_whitespace", { GEMINI_API_KEY: "\t", GEMINI_SEO_MODEL: "\n" }],
  ]) {
    const provider = name.startsWith("gemini") ? "gemini" : "openai";
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    let loads = 0;
    const result = await runBlogGroundedResearchRuntime(
      makeRequest({ provider }),
      {
        deps: {
          env,
          loadOpenAiAdapter: async () => {
            loads += 1;
            throw new Error("no");
          },
          loadGeminiAdapter: async () => {
            loads += 1;
            throw new Error("no");
          },
        },
      }
    );
    const encoded = JSON.stringify(result);
    ok(
      `R_not_configured_${name}`,
      result.ok === false &&
        result.code === "provider_not_configured" &&
        loads === 0 &&
        !encoded.includes("test-secret") &&
        !encoded.includes("sk-") &&
        deepEqual(result, createBlogGroundedResearchFailure("provider_not_configured"))
    );
  }

  // ---------- PROVIDER SELECTION ----------
  {
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    let openaiLoads = 0;
    let geminiLoads = 0;
    let openaiCalls = 0;
    let geminiCalls = 0;
    await runBlogGroundedResearchRuntime(makeRequest({ provider: "openai" }), {
      deps: {
        env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
        loadOpenAiAdapter: async () => {
          openaiLoads += 1;
          return {
            callOpenAiGroundedResearch: async () => {
              openaiCalls += 1;
              return { ok: true, packet: makeReadyPacket("openai") };
            },
          };
        },
        loadGeminiAdapter: async () => {
          geminiLoads += 1;
          return {
            callGeminiGroundedResearch: async () => {
              geminiCalls += 1;
              return { ok: true, packet: makeReadyPacket("gemini") };
            },
          };
        },
      },
    });
    ok(
      "R_select_openai_only",
      openaiLoads === 1 &&
        geminiLoads === 0 &&
        openaiCalls === 1 &&
        geminiCalls === 0
    );
  }

  {
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    let openaiLoads = 0;
    let geminiLoads = 0;
    let openaiCalls = 0;
    let geminiCalls = 0;
    await runBlogGroundedResearchRuntime(makeRequest({ provider: "gemini" }), {
      deps: {
        env: { GEMINI_API_KEY: "k", GEMINI_SEO_MODEL: "m" },
        loadOpenAiAdapter: async () => {
          openaiLoads += 1;
          return {
            callOpenAiGroundedResearch: async () => {
              openaiCalls += 1;
              return { ok: true, packet: makeReadyPacket("openai") };
            },
          };
        },
        loadGeminiAdapter: async () => {
          geminiLoads += 1;
          return {
            callGeminiGroundedResearch: async () => {
              geminiCalls += 1;
              return { ok: true, packet: makeReadyPacket("gemini") };
            },
          };
        },
      },
    });
    ok(
      "R_select_gemini_only",
      openaiLoads === 0 &&
        geminiLoads === 1 &&
        openaiCalls === 0 &&
        geminiCalls === 1
    );
  }

  // ---------- SIGNAL IDENTITY ----------
  {
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    const controller = new AbortController();
    let received;
    await runBlogGroundedResearchRuntime(makeRequest(), {
      signal: controller.signal,
      deps: {
        env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
        loadOpenAiAdapter: async () => ({
          callOpenAiGroundedResearch: async (_s, _c, options) => {
            received = options?.signal;
            return { ok: true, packet: makeReadyPacket("openai") };
          },
        }),
        loadGeminiAdapter: async () => {
          throw new Error("no");
        },
      },
    });
    ok("R_signal_identity", received === controller.signal);
  }

  // ---------- LOADER THROW ----------
  {
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    const result = await runBlogGroundedResearchRuntime(makeRequest(), {
      deps: {
        env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
        loadOpenAiAdapter: async () => {
          throw new Error("sk-secret module boom");
        },
      },
    });
    ok(
      "R_loader_throw_sanitized",
      result.ok === false &&
        result.code === "provider_upstream" &&
        !JSON.stringify(result).includes("sk-secret")
    );
  }

  // ---------- CONCURRENCY ----------
  {
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    let firstCalls = 0;
    let secondLoads = 0;

    const firstPromise = runBlogGroundedResearchRuntime(makeRequest(), {
      deps: {
        env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
        loadOpenAiAdapter: async () => ({
          callOpenAiGroundedResearch: async () => {
            firstCalls += 1;
            await gate;
            return { ok: true, packet: makeReadyPacket("openai") };
          },
        }),
      },
    });

    // Yield so first acquires slot and enters provider call.
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));

    const busy = await runBlogGroundedResearchRuntime(makeRequest(), {
      deps: {
        env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
        loadOpenAiAdapter: async () => {
          secondLoads += 1;
          return {
            callOpenAiGroundedResearch: async () => ({
              ok: true,
              packet: makeReadyPacket("openai"),
            }),
          };
        },
      },
    });
    ok(
      "R_busy_second",
      busy.ok === false &&
        busy.code === "research_busy" &&
        busy.status === 429 &&
        secondLoads === 0 &&
        firstCalls === 1
    );

    release();
    const first = await firstPromise;
    ok("R_busy_first_ok", first.ok === true);

    let thirdCalls = 0;
    const third = await runBlogGroundedResearchRuntime(makeRequest(), {
      deps: {
        env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
        loadOpenAiAdapter: async () => ({
          callOpenAiGroundedResearch: async () => {
            thirdCalls += 1;
            return { ok: true, packet: makeReadyPacket("openai") };
          },
        }),
      },
    });
    ok("R_slot_released_success", third.ok === true && thirdCalls === 1);
  }

  for (const [label, impl] of [
    [
      "failure",
      async () => createBlogGroundedResearchFailure("provider_timeout"),
    ],
    [
      "abort",
      async () => createBlogGroundedResearchFailure("request_aborted"),
    ],
    [
      "throw",
      async () => {
        throw new Error("raw boom");
      },
    ],
  ]) {
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const firstPromise = runBlogGroundedResearchRuntime(makeRequest(), {
      deps: {
        env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
        loadOpenAiAdapter: async () => ({
          callOpenAiGroundedResearch: async () => {
            await gate;
            return impl();
          },
        }),
      },
    });
    await new Promise((r) => setImmediate(r));
    await new Promise((r) => setImmediate(r));
    const busy = await runBlogGroundedResearchRuntime(makeRequest(), {
      deps: {
        env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
        loadOpenAiAdapter: async () => ({
          callOpenAiGroundedResearch: async () => ({
            ok: true,
            packet: makeReadyPacket("openai"),
          }),
        }),
      },
    });
    ok(`R_busy_during_${label}`, busy.code === "research_busy");
    release();
    await firstPromise;
    const after = await runBlogGroundedResearchRuntime(makeRequest(), {
      deps: {
        env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
        loadOpenAiAdapter: async () => ({
          callOpenAiGroundedResearch: async () => ({
            ok: true,
            packet: makeReadyPacket("openai"),
          }),
        }),
      },
    });
    ok(`R_slot_released_${label}`, after.ok === true);
  }

  // ---------- ROUTE HELPERS ----------
  function createMockRes() {
    const res = new EventEmitter();
    res.statusCode = 200;
    res.headers = {};
    res.body = null;
    res.writableEnded = false;
    res.destroyed = false;
    res.writeCount = 0;
    res.status = (code) => {
      res.writeCount += 1;
      res.statusCode = code;
      return res;
    };
    res.setHeader = (k, v) => {
      res.headers[k] = v;
    };
    res.json = (body) => {
      res.writeCount += 1;
      res.body = body;
      res.writableEnded = true;
      return res;
    };
    return res;
  }

  function createMockReq(method, body) {
    const req = new EventEmitter();
    req.method = method;
    req.body = body;
    req.headers = {};
    req.aborted = false;
    return req;
  }

  function loadRoute(stubs) {
    return loadTsModule("pages/api/admin-blog-research.ts", stubs);
  }

  const validBody = makeRequest();

  // ---------- METHOD ----------
  {
    let authCalls = 0;
    let rlCalls = 0;
    let runtimeCalls = 0;
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => {
          authCalls += 1;
          return { sessionId: 1, role: "super_admin" };
        },
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => {
          rlCalls += 1;
          return { allowed: true, remaining: 9, retryAfterSec: 1 };
        },
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => {
          runtimeCalls += 1;
          return { ok: true, provider: "openai", evidence: makeReadyEvidence() };
        },
      },
    }).default;
    const res = createMockRes();
    await handler(createMockReq("GET", validBody), res);
    ok(
      "API_method_405",
      res.statusCode === 405 &&
        res.body?.code === "invalid_request" &&
        authCalls === 0 &&
        rlCalls === 0 &&
        runtimeCalls === 0
    );
  }

  // ---------- AUTH ----------
  {
    let runtimeCalls = 0;
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async (_req, res, permission) => {
          ok("API_auth_permission_blog_manage", permission === "blog.manage");
          res.status(401).json({ error: "Unauthorized" });
          return null;
        },
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => {
          runtimeCalls += 1;
          return { ok: true, provider: "openai", evidence: makeReadyEvidence() };
        },
      },
    }).default;
    const res = createMockRes();
    await handler(createMockReq("POST", validBody), res);
    ok(
      "API_auth_blocks",
      res.statusCode === 401 && runtimeCalls === 0
    );
  }

  {
    let runtimeCalls = 0;
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async (_req, res) => {
          res.status(403).json({
            error: "Forbidden",
            message: "You do not have permission for this action.",
          });
          return null;
        },
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => {
          runtimeCalls += 1;
          return { ok: true, provider: "openai", evidence: makeReadyEvidence() };
        },
      },
    }).default;
    const res = createMockRes();
    await handler(createMockReq("POST", validBody), res);
    ok("API_rbac_403", res.statusCode === 403 && runtimeCalls === 0);
  }

  // ---------- CANARY SUPER_ADMIN-ONLY (route-local) ----------
  async function assertCanaryRoleDenied(roleLabel, adminIdentity) {
    let rlCalls = 0;
    let runtimeCalls = 0;
    let parseTriggered = false;
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async (_req, _res, permission) => {
          ok(
            `API_canary_${roleLabel}_still_checks_blog_manage`,
            permission === "blog.manage"
          );
          return adminIdentity;
        },
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => {
          rlCalls += 1;
          return { allowed: true, remaining: 9, retryAfterSec: 1 };
        },
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => {
          runtimeCalls += 1;
          return { ok: true, provider: "openai", evidence: makeReadyEvidence() };
        },
      },
      "@/lib/blogGroundedResearchContracts": {
        BLOG_GROUNDED_RESEARCH_TASK,
        createBlogGroundedResearchFailure,
        parseBlogGroundedResearchRequest: (raw) => {
          parseTriggered = true;
          return parseBlogGroundedResearchRequest(raw);
        },
      },
    }).default;
    const res = createMockRes();
    await handler(createMockReq("POST", validBody), res);
    ok(
      `API_canary_${roleLabel}_403`,
      res.statusCode === 403 &&
        res.body?.error === "Forbidden" &&
        res.body?.message === "You do not have permission for this action." &&
        rlCalls === 0 &&
        runtimeCalls === 0 &&
        parseTriggered === false
    );
  }

  await assertCanaryRoleDenied("manager", {
    sessionId: 2,
    role: "manager",
  });
  await assertCanaryRoleDenied("writer", {
    sessionId: 3,
    role: "writer",
  });
  await assertCanaryRoleDenied("unknown_role", {
    sessionId: 4,
    role: "viewer",
  });
  await assertCanaryRoleDenied("missing_role", {
    sessionId: 5,
  });

  {
    let rlCalls = 0;
    let runtimeCalls = 0;
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 9,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => {
          rlCalls += 1;
          return { allowed: true, remaining: 9, retryAfterSec: 1 };
        },
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => {
          runtimeCalls += 1;
          return { ok: true, provider: "openai", evidence: makeReadyEvidence() };
        },
      },
    }).default;
    const res = createMockRes();
    await handler(createMockReq("POST", validBody), res);
    ok(
      "API_canary_super_admin_reaches_runtime",
      res.statusCode === 200 &&
        res.body?.ok === true &&
        rlCalls === 1 &&
        runtimeCalls === 1
    );
  }

  // ---------- INVALID REQUEST ----------
  {
    let rlCalls = 0;
    let runtimeCalls = 0;
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 42,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => {
          rlCalls += 1;
          return { allowed: true, remaining: 9, retryAfterSec: 1 };
        },
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => {
          runtimeCalls += 1;
          return { ok: true, provider: "openai", evidence: makeReadyEvidence() };
        },
      },
    }).default;
    const res = createMockRes();
    await handler(createMockReq("POST", { bad: true }), res);
    ok(
      "API_invalid_request",
      res.statusCode === 400 &&
        res.body?.code === "invalid_request" &&
        rlCalls === 0 &&
        runtimeCalls === 0
    );
  }

  // ---------- RATE LIMIT ----------
  {
    let runtimeCalls = 0;
    let rlKey = null;
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 77,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: (sessionId) => {
          rlKey = sessionId;
          return { allowed: false, remaining: 0, retryAfterSec: 33 };
        },
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => {
          runtimeCalls += 1;
          return { ok: true, provider: "openai", evidence: makeReadyEvidence() };
        },
      },
    }).default;
    const res = createMockRes();
    await handler(createMockReq("POST", validBody), res);
    ok(
      "API_rate_limited",
      res.statusCode === 429 &&
        res.body?.code === "rate_limited" &&
        res.headers["Retry-After"] === "33" &&
        rlKey === 77 &&
        runtimeCalls === 0
    );
  }

  // ---------- SUCCESS READY / MISSING ----------
  {
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => ({
          ok: true,
          provider: "openai",
          evidence: makeReadyEvidence("ready"),
        }),
      },
    }).default;
    const res = createMockRes();
    await handler(createMockReq("POST", validBody), res);
    ok(
      "API_ready_200",
      res.statusCode === 200 &&
        res.body?.ok === true &&
        res.body?.provider === "openai" &&
        res.body?.task === "research_blog_evidence" &&
        res.body?.evidence?.evidenceState === "ready"
    );
  }

  {
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => ({
          ok: true,
          provider: "gemini",
          evidence: makeReadyEvidence("missing"),
        }),
      },
    }).default;
    const res = createMockRes();
    await handler(
      createMockReq("POST", makeRequest({ provider: "gemini" })),
      res
    );
    ok(
      "API_missing_200",
      res.statusCode === 200 &&
        res.body?.ok === true &&
        res.body?.evidence?.evidenceState === "missing" &&
        res.body?.evidence?.reasonCodes?.includes("UNGROUNDED_SOURCE")
    );
  }

  // ---------- BUSY + PROVIDER FAILURES ----------
  {
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () =>
          createBlogGroundedResearchFailure("research_busy"),
      },
    }).default;
    const res = createMockRes();
    await handler(createMockReq("POST", validBody), res);
    const expected = createBlogGroundedResearchFailure("research_busy");
    ok(
      "API_busy",
      res.statusCode === 429 &&
        res.body?.code === "research_busy" &&
        res.body?.message === expected.message
    );
  }

  for (const code of [
    "request_aborted",
    "provider_timeout",
    "provider_upstream",
    "malformed_provider_output",
    "grounding_unavailable",
    "provider_not_configured",
  ]) {
    const expected = createBlogGroundedResearchFailure(code);
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => expected,
      },
    }).default;
    const res = createMockRes();
    await handler(createMockReq("POST", validBody), res);
    ok(
      `API_fail_${code}`,
      res.statusCode === expected.status &&
        deepEqual(res.body, {
          ok: false,
          code: expected.code,
          message: expected.message,
        })
    );
  }

  // ---------- CANCELLATION / LISTENER CLEANUP ----------
  {
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async (_req, options) => {
          ok(
            "API_signal_present",
            options?.signal instanceof AbortSignal
          );
          return {
            ok: true,
            provider: "openai",
            evidence: makeReadyEvidence("ready"),
          };
        },
      },
    }).default;
    const req = createMockReq("POST", validBody);
    const res = createMockRes();
    await handler(req, res);
    ok(
      "API_listeners_cleaned_success",
      req.listenerCount("aborted") === 0 && res.listenerCount("close") === 0
    );
  }

  {
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () =>
          createBlogGroundedResearchFailure("provider_upstream"),
      },
    }).default;
    const req = createMockReq("POST", validBody);
    const res = createMockRes();
    await handler(req, res);
    ok(
      "API_listeners_cleaned_failure",
      req.listenerCount("aborted") === 0 && res.listenerCount("close") === 0
    );
  }

  {
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => {
          throw new Error("sk-secret route boom");
        },
      },
    }).default;
    const req = createMockReq("POST", validBody);
    const res = createMockRes();
    await handler(req, res);
    ok(
      "API_listeners_cleaned_throw",
      req.listenerCount("aborted") === 0 &&
        res.listenerCount("close") === 0 &&
        res.statusCode === 503 &&
        res.body?.code === "provider_upstream" &&
        !JSON.stringify(res.body).includes("sk-secret")
    );
  }

  {
    let observedSignal;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async (_request, options) => {
          observedSignal = options?.signal;
          await gate;
          if (options?.signal?.aborted) {
            return createBlogGroundedResearchFailure("request_aborted");
          }
          return {
            ok: true,
            provider: "openai",
            evidence: makeReadyEvidence("ready"),
          };
        },
      },
    }).default;
    const req = createMockReq("POST", validBody);
    const res = createMockRes();
    const done = handler(req, res);
    await new Promise((r) => setImmediate(r));
    req.emit("aborted");
    ok("API_client_abort_signal", observedSignal?.aborted === true);
    release();
    await done;
    ok(
      "API_client_abort_result",
      res.statusCode === 499 &&
        res.body?.code === "request_aborted" &&
        req.listenerCount("aborted") === 0 &&
        res.listenerCount("close") === 0
    );
  }

  // ---------- R3B PRE-EXISTING DISCONNECT ----------
  {
    let runtimeCalls = 0;
    const expected = createBlogGroundedResearchFailure("request_aborted");
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => {
          runtimeCalls += 1;
          return {
            ok: true,
            provider: "openai",
            evidence: makeReadyEvidence("ready"),
          };
        },
      },
    }).default;
    const req = createMockReq("POST", validBody);
    req.aborted = true;
    const res = createMockRes();
    await handler(req, res);
    ok(
      "API_pre_aborted_no_runtime",
      runtimeCalls === 0 &&
        res.statusCode === 499 &&
        res.body?.code === "request_aborted" &&
        res.body?.message === expected.message &&
        deepEqual(res.body, {
          ok: false,
          code: expected.code,
          message: expected.message,
        }) &&
        req.listenerCount("aborted") === 0 &&
        res.listenerCount("close") === 0
    );
  }

  {
    let runtimeCalls = 0;
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => {
          runtimeCalls += 1;
          return {
            ok: true,
            provider: "openai",
            evidence: makeReadyEvidence("ready"),
          };
        },
      },
    }).default;
    const req = createMockReq("POST", validBody);
    const res = createMockRes();
    res.destroyed = true;
    let threw = false;
    try {
      await handler(req, res);
    } catch {
      threw = true;
    }
    ok(
      "API_pre_destroyed_no_runtime",
      runtimeCalls === 0 &&
        res.writeCount === 0 &&
        res.body === null &&
        threw === false &&
        req.listenerCount("aborted") === 0 &&
        res.listenerCount("close") === 0
    );
  }

  {
    let runtimeCalls = 0;
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async () => {
          runtimeCalls += 1;
          return {
            ok: true,
            provider: "openai",
            evidence: makeReadyEvidence("ready"),
          };
        },
      },
    }).default;
    const req = createMockReq("POST", validBody);
    const res = createMockRes();
    ok(
      "API_normal_not_pre_disconnected",
      req.aborted !== true && res.destroyed !== true
    );
    await handler(req, res);
    ok(
      "API_normal_still_invokes_runtime",
      runtimeCalls === 1 &&
        res.statusCode === 200 &&
        res.body?.ok === true &&
        res.body?.evidence?.evidenceState === "ready"
    );
  }

  {
    let observedSignal;
    let release;
    const gate = new Promise((resolve) => {
      release = resolve;
    });
    const handler = loadRoute({
      "@/lib/adminAuth": {
        requireAdminPermission: async () => ({
          sessionId: 1,
          role: "super_admin",
        }),
      },
      "@/lib/rateLimit": {
        RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
      },
      "@/lib/blogGroundedResearchRuntime.server": {
        runBlogGroundedResearchRuntime: async (_request, options) => {
          observedSignal = options?.signal;
          await gate;
          if (options?.signal?.aborted) {
            return createBlogGroundedResearchFailure("request_aborted");
          }
          return {
            ok: true,
            provider: "openai",
            evidence: makeReadyEvidence("ready"),
          };
        },
      },
    }).default;
    const req = createMockReq("POST", validBody);
    const res = createMockRes();
    const done = handler(req, res);
    await new Promise((r) => setImmediate(r));
    // Simulate premature response close: destroy first, then emit close.
    res.destroyed = true;
    res.emit("close");
    ok("API_res_close_signal", observedSignal?.aborted === true);
    release();
    await done;
    ok(
      "API_res_close_no_write_cleaned",
      res.writeCount === 0 &&
        res.body === null &&
        req.listenerCount("aborted") === 0 &&
        res.listenerCount("close") === 0
    );
  }

  // ---------- STATIC ISOLATION ----------
  const runtimeStripped = stripCommentsAndStrings(runtimeSrc);
  const routeStripped = stripCommentsAndStrings(routeSrc);

  ok(
    "I_runtime_no_static_openai",
    !/from\s+["']@\/lib\/blogGroundedResearchOpenAi\.server["']/.test(
      runtimeSrc
    ) && !/require\(\s*["']@\/lib\/blogGroundedResearchOpenAi\.server["']\s*\)/.test(
      runtimeStripped
    )
  );
  ok(
    "I_runtime_no_static_gemini",
    !/from\s+["']@\/lib\/blogGroundedResearchGemini\.server["']/.test(
      runtimeSrc
    )
  );
  ok(
    "I_runtime_dynamic_openai",
    /import\(\s*["']@\/lib\/blogGroundedResearchOpenAi\.server["']\s*\)/.test(
      runtimeSrc
    )
  );
  ok(
    "I_runtime_dynamic_gemini",
    /import\(\s*["']@\/lib\/blogGroundedResearchGemini\.server["']\s*\)/.test(
      runtimeSrc
    )
  );
  ok(
    "I_runtime_no_seoAi",
    !/@\/lib\/seoAi/.test(runtimeSrc) && !/@\/lib\/seoAiServer/.test(runtimeSrc)
  );
  ok(
    "I_runtime_no_timers",
    !/setTimeout\s*\(/.test(runtimeStripped) &&
      !/setInterval\s*\(/.test(runtimeStripped) &&
      !/new\s+AbortController\s*\(/.test(runtimeStripped)
  );
  ok(
    "I_runtime_no_timeoutMs",
    !/timeoutMs/.test(runtimeStripped)
  );
  ok(
    "I_runtime_no_db_fetch",
    !/@\/lib\/db/.test(runtimeSrc) &&
      !/\bfetch\s*\(/.test(runtimeStripped) &&
      !/\bmysql\b/.test(runtimeStripped)
  );
  ok(
    "I_runtime_uses_r2",
    /runBlogGroundedResearchValidation/.test(runtimeSrc)
  );
  ok(
    "I_route_uses_requireAdminPermission",
    /requireAdminPermission\s*\(/.test(routeSrc) &&
      /["']blog\.manage["']/.test(routeSrc)
  );
  ok(
    "I_route_canary_super_admin_only",
    /admin\.role\s*!==\s*["']super_admin["']/.test(routeSrc) &&
      /You do not have permission for this action\./.test(routeSrc) &&
      routeSrc.indexOf("requireAdminPermission") <
        routeSrc.indexOf('admin.role !== "super_admin"') &&
      routeSrc.indexOf('admin.role !== "super_admin"') <
        routeSrc.indexOf("parseBlogGroundedResearchRequest(req.body)") &&
      routeSrc.indexOf('admin.role !== "super_admin"') <
        routeSrc.indexOf("RL_SEO_AI(admin.sessionId)")
  );
  ok(
    "I_route_uses_RL_SEO_AI",
    /RL_SEO_AI\s*\(/.test(routeSrc) && /admin\.sessionId/.test(routeSrc)
  );
  ok(
    "I_route_uses_r0_parser",
    /parseBlogGroundedResearchRequest\s*\(/.test(routeSrc)
  );
  ok(
    "I_route_no_seoAi",
    !/@\/lib\/seoAi/.test(routeSrc) && !/@\/lib\/seoAiServer/.test(routeSrc)
  );
  ok(
    "I_route_no_db",
    !/@\/lib\/db/.test(routeSrc) && !/\bmysql\b/.test(routeSrc)
  );
  ok(
    "I_route_no_timers",
    !/setTimeout\s*\(/.test(routeStripped) &&
      !/setInterval\s*\(/.test(routeStripped)
  );
  ok(
    "I_route_has_request_scoped_abort",
    /new\s+AbortController\s*\(/.test(routeSrc)
  );
  ok(
    "I_route_removes_listeners",
    /removeListener\s*\(\s*["']aborted["']/.test(routeSrc) &&
      /removeListener\s*\(\s*["']close["']/.test(routeSrc)
  );
  ok(
    "I_admin_seo_ai_untouched",
    !/blogGroundedResearchRuntime/.test(adminSeoAiSrc) &&
      !/admin-blog-research/.test(adminSeoAiSrc) &&
      !/research_blog_evidence/.test(adminSeoAiSrc)
  );
  ok(
    "I_seoAi_untouched",
    !/blogGroundedResearchRuntime/.test(seoAiSrc) &&
      !/admin-blog-research/.test(seoAiSrc)
  );
  ok(
    "I_seoAiServer_untouched",
    !/blogGroundedResearchRuntime/.test(seoAiServerSrc) &&
      !/admin-blog-research/.test(seoAiServerSrc)
  );
  ok(
    "I_rateLimit_preexisting_interval",
    /setInterval\s*\(/.test(rateLimitSrc)
  );
  ok(
    "I_no_fallback_retry",
    !/fallbackProvider/.test(runtimeStripped) &&
      !/providerOrder/.test(runtimeStripped) &&
      !/\bretry\b/.test(runtimeStripped) &&
      !/backoff/.test(runtimeStripped)
  );

  {
    const repoRefs = [];
    function walk(dir) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        if (
          entry.name === "node_modules" ||
          entry.name === ".git" ||
          entry.name === ".next" ||
          entry.name.startsWith("_")
        ) {
          continue;
        }
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(entry.name)) {
          const text = fs.readFileSync(full, "utf8");
          if (
            /blogGroundedResearchRuntime\.server/.test(text) ||
            /admin-blog-research/.test(text)
          ) {
            repoRefs.push(path.relative(ROOT, full).replace(/\\/g, "/"));
          }
        }
      }
    }
    walk(ROOT);
    const allowed = new Set([
      "lib/blogGroundedResearchRuntime.server.ts",
      "pages/api/admin-blog-research.ts",
      "scripts/phase-ab7b-r3-grounded-research-route-tests.js",
    ]);
    const unexpected = repoRefs.filter((r) => !allowed.has(r));
    ok(
      "I_repo_refs_only_r3",
      unexpected.length === 0,
      unexpected.join(", ") || "ok"
    );
  }

  // Parser sanity (ordering: invalid before RL)
  {
    const bad = parseBlogGroundedResearchRequest({});
    ok(
      "R0_parser_invalid",
      bad.ok === false && bad.code === "invalid_request" && bad.status === 400
    );
  }

  console.log(`\nAB-7B R3 results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
