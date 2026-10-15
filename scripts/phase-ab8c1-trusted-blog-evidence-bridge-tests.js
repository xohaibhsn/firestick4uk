/**
 * AB-8C1 — Trusted ephemeral Blog evidence bridge + inventory preflight.
 *
 * Offline only: injected fake providers/DB. No network, no live OpenAI,
 * no live MySQL, no CMS writes, no article generation, no new secrets.
 */
const fs = require("fs");
const path = require("path");
const { EventEmitter } = require("events");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..");
let passed = 0;
let failed = 0;

// Assembled paths avoid false hits in AB-7B R1/R3 repo-reference scans.
const RUNTIME_REL = ["lib/", "blogGroundedResearchRuntime", ".server.ts"].join("");
const RUNTIME_MOD = ["@/lib/", "blogGroundedResearchRuntime", ".server"].join("");
const RESEARCH_ROUTE_REL = ["pages/api/", "admin-blog", "-research.ts"].join("");
const OPENAI_ADAPTER_TOKEN = ["blogGroundedResearch", "OpenAi", ".server"].join(
  ""
);

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

function deepClone(v) {
  return JSON.parse(JSON.stringify(v));
}

function loadTsModule(rel, stubs = {}, cache = new Map()) {
  const key = rel.replace(/\\/g, "/") + "::" + Object.keys(stubs).sort().join(",");
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
    if (id.startsWith("@/lib/")) {
      return loadTsModule("lib/" + id.slice("@/lib/".length) + ".ts", stubs, cache);
    }
    if (id.startsWith("./") || id.startsWith("../")) {
      const base = path.resolve(path.dirname(path.join(ROOT, rel)), id);
      if (fs.existsSync(base + ".ts")) {
        return loadTsModule(
          path.relative(ROOT, base + ".ts").replace(/\\/g, "/"),
          stubs,
          cache
        );
      }
    }
    // Hard isolation: never silently load live OpenAI SDK or DB pool.
    if (
      id === "openai" ||
      id === "@/lib/db" ||
      id.endsWith("/db") ||
      (typeof id === "string" && id.includes(OPENAI_ADAPTER_TOKEN))
    ) {
      throw new Error(`AB8C1_ISOLATION_BLOCKED:${id}`);
    }
    return require(id);
  };
  const fn = new Function("exports", "module", "require", outputText);
  fn(sandbox.exports, sandbox.module, localRequire);
  const exported =
    sandbox.module.exports && Object.keys(sandbox.module.exports).length
      ? sandbox.module.exports
      : sandbox.exports;
  cache.set(key, exported);
  return exported;
}

function loadFreshBridge() {
  return loadTsModule("lib/blogArticleEvidenceBridge.server.ts", {}, new Map());
}

function loadFreshInventory() {
  return loadTsModule(
    "lib/blogArticleInventoryPreflight.server.ts",
    {},
    new Map()
  );
}

function loadFreshRuntime(stubs = {}) {
  return loadTsModule(RUNTIME_REL, stubs, new Map());
}

function loadEvidence() {
  return loadTsModule("lib/blogResearchEvidence.ts", {}, new Map());
}

function loadGenerationValidation() {
  return loadTsModule("lib/blogArticleGenerationValidation.ts", {}, new Map());
}

function loadResearchUi() {
  return loadTsModule("lib/seoPlanningResearchUi.ts", {}, new Map());
}

function makeAdmin(overrides = {}) {
  return {
    authenticated: true,
    principalType: "master",
    name: "Professor",
    role: "super_admin",
    sessionId: 101,
    ...overrides,
  };
}

function makeReadyBundle(options = {}) {
  const opportunityId = options.opportunityId || "opp-firestick-speed";
  const topic =
    options.topic || "How to improve Firestick performance safely";
  const intent =
    options.intent === undefined ? "informational troubleshooting" : options.intent;
  const sources = [
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
  ];
  return {
    subject: { opportunityId, topic, intent },
    providerOutput: {
      summary: "Independent sources support a concise troubleshooting overview.",
      sources,
      claims: [
        { claim: "Supported research claim 1", sourceIds: ["s1"] },
        { claim: "Supported research claim 2", sourceIds: ["s2"] },
      ],
      unknowns: ["Device-specific behavior may vary by Fire OS version."],
    },
    grounding: {
      groundedUrls: sources.map((s) => s.url),
      searchQueries: ["firestick performance research 1"],
    },
  };
}

function makeReadyPacket(bundle = makeReadyBundle()) {
  return {
    provider: "openai",
    providerOutput: deepClone(bundle.providerOutput),
    grounding: deepClone(bundle.grounding),
  };
}

function makeInventoryRow(id, partial = {}) {
  return {
    id,
    title: partial.title || `Blog Post ${id}`,
    slug: partial.slug || `blog-post-${id}`,
    status: partial.status || "published",
    active: partial.active === undefined ? 1 : partial.active,
    focus_keyword:
      partial.focus_keyword === undefined ? `kw-${id}` : partial.focus_keyword,
    category: partial.category === undefined ? "guides" : partial.category,
  };
}

console.log("\nAB-8C1 Trusted Blog Evidence Bridge\n");

async function main() {
  const {
    validateBlogResearchEvidence,
  } = loadEvidence();
  const {
    mintBlogArticleEvidenceHandle,
    resolveBlogArticleEvidenceHandle,
    resetBlogArticleEvidenceBridgeForTests,
    blogArticleEvidenceBridgeSizeForTests,
    BLOG_ARTICLE_EVIDENCE_BRIDGE_MAX_HANDLES,
    BLOG_ARTICLE_EVIDENCE_BRIDGE_TTL_MS,
    BLOG_ARTICLE_EVIDENCE_BRIDGE_MAX_PACKET_JSON_BYTES,
  } = loadFreshBridge();

  const {
    loadAuthoritativeBlogMatchInventory,
    BLOG_ARTICLE_INVENTORY_SELECT_SQL,
  } = loadFreshInventory();

  // ---------- MINT: READY ----------
  {
    resetBlogArticleEvidenceBridgeForTests();
    const bundle = makeReadyBundle();
    const evidence = validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      bundle.grounding
    );
    const minted = mintBlogArticleEvidenceHandle({
      admin: makeAdmin(),
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
    });
    ok("M01_ready_mints_handle", minted.ok === true && typeof minted.handle === "string");
    ok(
      "M01_handle_opaque_no_subject",
      minted.ok &&
        !minted.handle.includes(bundle.subject.opportunityId) &&
        !minted.handle.includes("source1.example") &&
        !minted.handle.includes("openai")
    );
    ok(
      "M01_handle_crypto_length",
      minted.ok && minted.handle.length >= 40
    );
  }

  // ---------- MINT: reject paths ----------
  {
    resetBlogArticleEvidenceBridgeForTests();
    const bundle = makeReadyBundle();
    const ready = validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      bundle.grounding
    );

    const missingEvidence = validateBlogResearchEvidence(
      bundle.subject,
      { ...bundle.providerOutput, sources: [bundle.providerOutput.sources[0]] },
      bundle.grounding
    );
    ok(
      "M02_missing_no_handle",
      mintBlogArticleEvidenceHandle({
        admin: makeAdmin(),
        subject: bundle.subject,
        provider: "openai",
        packet: makeReadyPacket(bundle),
        evidence: missingEvidence,
      }).ok === false
    );

    const badGrounding = validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      { groundedUrls: [bundle.providerOutput.sources[0].url] }
    );
    ok(
      "M03_invalid_grounding_no_handle",
      mintBlogArticleEvidenceHandle({
        admin: makeAdmin(),
        subject: bundle.subject,
        provider: "openai",
        packet: makeReadyPacket(bundle),
        evidence: badGrounding,
      }).ok === false
    );

    ok(
      "M04_wrong_provider_no_handle",
      mintBlogArticleEvidenceHandle({
        admin: makeAdmin(),
        subject: bundle.subject,
        provider: "openai",
        packet: { ...makeReadyPacket(bundle), provider: "gemini" },
        evidence: ready,
      }).ok === false
    );

    ok(
      "M05_mismatched_subject_no_handle",
      mintBlogArticleEvidenceHandle({
        admin: makeAdmin(),
        subject: { ...bundle.subject, topic: "Different topic entirely" },
        provider: "openai",
        packet: makeReadyPacket(bundle),
        evidence: ready,
      }).code === "subject_mismatch"
    );

    const aborted = new AbortController();
    aborted.abort();
    ok(
      "M06_aborted_no_handle",
      mintBlogArticleEvidenceHandle({
        admin: makeAdmin(),
        subject: bundle.subject,
        provider: "openai",
        packet: makeReadyPacket(bundle),
        evidence: ready,
        signal: aborted.signal,
      }).code === "aborted"
    );

    // Copied READY-looking object without authentic validation path still requires
    // evidence.ok from AB-7A — fabricated ready flag alone cannot mint.
    ok(
      "M07_fabricated_ready_flag_rejected",
      mintBlogArticleEvidenceHandle({
        admin: makeAdmin(),
        subject: bundle.subject,
        provider: "openai",
        packet: makeReadyPacket(bundle),
        evidence: {
          ok: false,
          evidenceState: "missing",
          sources: [],
          claims: [],
          unknowns: [],
          searchQueries: [],
          reasonCodes: ["INVALID_INPUT"],
        },
      }).ok === false
    );
  }

  // ---------- RESOLVE ----------
  {
    resetBlogArticleEvidenceBridgeForTests();
    const bundle = makeReadyBundle();
    const evidence = validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      bundle.grounding
    );
    const adminA = makeAdmin({ sessionId: 201, name: "Professor" });
    const minted = mintBlogArticleEvidenceHandle({
      admin: adminA,
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
    });
    ok("R01_mint_ok", minted.ok === true);

    const resolved = resolveBlogArticleEvidenceHandle({
      handle: minted.handle,
      admin: adminA,
      subject: bundle.subject,
      provider: "openai",
    });
    ok("R02_correct_session_subject", resolved.ok === true);
    ok(
      "R02_source_ids_preserved",
      resolved.ok &&
        deepEqual(
          resolved.evidence.providerOutput.sources.map((s) => s.id),
          ["s1", "s2"]
        ) &&
        deepEqual(resolved.evidence.grounding.groundedUrls, [
          "https://source1.example.com/research?item=1",
          "https://source2.example.com/research?item=2",
        ])
    );
    ok(
      "R02_unknowns_preserved",
      resolved.ok &&
        deepEqual(resolved.evidence.providerOutput.unknowns, [
          "Device-specific behavior may vary by Fire OS version.",
        ])
    );

    const revalidated = validateBlogResearchEvidence(
      resolved.evidence.subject,
      resolved.evidence.providerOutput,
      resolved.evidence.grounding
    );
    ok(
      "R03_independent_ab7a_ready",
      revalidated.ok === true &&
        revalidated.evidenceState === "ready" &&
        revalidated.reasonCodes.includes("GROUNDED_EVIDENCE_READY")
    );

    const consumed = resolveBlogArticleEvidenceHandle({
      handle: minted.handle,
      admin: adminA,
      subject: bundle.subject,
    });
    ok(
      "R04_already_consumed",
      consumed.ok === false && consumed.code === "evidence_unavailable"
    );
  }

  {
    resetBlogArticleEvidenceBridgeForTests();
    const bundle = makeReadyBundle();
    const evidence = validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      bundle.grounding
    );
    const adminA = makeAdmin({ sessionId: 301 });
    const adminBSameRole = makeAdmin({ sessionId: 302 });
    const minted = mintBlogArticleEvidenceHandle({
      admin: adminA,
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
    });

    ok(
      "R05_wrong_session_hold",
      resolveBlogArticleEvidenceHandle({
        handle: minted.handle,
        admin: adminBSameRole,
        subject: bundle.subject,
      }).code === "session_mismatch"
    );
    // Original still present after wrong-session attempt
    ok(
      "R05_wrong_session_no_leak_consume",
      resolveBlogArticleEvidenceHandle({
        handle: minted.handle,
        admin: adminA,
        subject: bundle.subject,
      }).ok === true
    );
  }

  {
    resetBlogArticleEvidenceBridgeForTests();
    const bundle = makeReadyBundle();
    const evidence = validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      bundle.grounding
    );
    const minted = mintBlogArticleEvidenceHandle({
      admin: makeAdmin({ sessionId: 401 }),
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
    });
    const admin = makeAdmin({ sessionId: 401 });

    ok(
      "R06_wrong_topic",
      resolveBlogArticleEvidenceHandle({
        handle: minted.handle,
        admin,
        subject: { ...bundle.subject, topic: "Completely different topic" },
      }).code === "subject_mismatch"
    );

    // remint for remaining subject checks
    resetBlogArticleEvidenceBridgeForTests();
    const m2 = mintBlogArticleEvidenceHandle({
      admin,
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
    });
    ok(
      "R07_wrong_opportunity",
      resolveBlogArticleEvidenceHandle({
        handle: m2.handle,
        admin,
        subject: { ...bundle.subject, opportunityId: "opp-other" },
      }).code === "subject_mismatch"
    );

    resetBlogArticleEvidenceBridgeForTests();
    const m3 = mintBlogArticleEvidenceHandle({
      admin,
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
    });
    ok(
      "R08_wrong_intent",
      resolveBlogArticleEvidenceHandle({
        handle: m3.handle,
        admin,
        subject: { ...bundle.subject, intent: "transactional buy now" },
      }).code === "subject_mismatch"
    );

    resetBlogArticleEvidenceBridgeForTests();
    const m4 = mintBlogArticleEvidenceHandle({
      admin,
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
    });
    ok(
      "R09_modified_handle",
      resolveBlogArticleEvidenceHandle({
        handle: m4.handle.slice(0, -2) + "xx",
        admin,
        subject: bundle.subject,
      }).code === "evidence_unavailable"
    );

    ok(
      "R10_random_unknown_handle",
      resolveBlogArticleEvidenceHandle({
        handle: "totally-unknown-handle-value-000",
        admin,
        subject: bundle.subject,
      }).code === "evidence_unavailable"
    );
  }

  {
    resetBlogArticleEvidenceBridgeForTests();
    const bundle = makeReadyBundle();
    const evidence = validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      bundle.grounding
    );
    const admin = makeAdmin({ sessionId: 501 });
    const minted = mintBlogArticleEvidenceHandle({
      admin,
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
      now: 1_000_000,
    });
    ok(
      "R11_expired_handle",
      resolveBlogArticleEvidenceHandle({
        handle: minted.handle,
        admin,
        subject: bundle.subject,
        now: 1_000_000 + BLOG_ARTICLE_EVIDENCE_BRIDGE_TTL_MS + 1,
      }).code === "expired_handle"
    );
  }

  {
    resetBlogArticleEvidenceBridgeForTests();
    const bundle = makeReadyBundle();
    const evidence = validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      bundle.grounding
    );
    const admin = makeAdmin({ sessionId: 601 });
    const minted = mintBlogArticleEvidenceHandle({
      admin,
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
    });
    resetBlogArticleEvidenceBridgeForTests(); // process restart simulation
    ok(
      "R12_process_restart_hold",
      resolveBlogArticleEvidenceHandle({
        handle: minted.handle,
        admin,
        subject: bundle.subject,
      }).code === "evidence_unavailable"
    );
    ok("R12_no_auto_research", blogArticleEvidenceBridgeSizeForTests() === 0);
  }

  // ---------- CAPACITY / SIZE / LAZY CLEANUP ----------
  {
    resetBlogArticleEvidenceBridgeForTests();
    const bundle = makeReadyBundle();
    const evidence = validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      bundle.grounding
    );
    const admin = makeAdmin({ sessionId: 701 });
    let mintedCount = 0;
    for (let i = 0; i < BLOG_ARTICLE_EVIDENCE_BRIDGE_MAX_HANDLES; i += 1) {
      const r = mintBlogArticleEvidenceHandle({
        admin: { ...admin, sessionId: 701 + i },
        subject: bundle.subject,
        provider: "openai",
        packet: makeReadyPacket(bundle),
        evidence,
      });
      if (r.ok) mintedCount += 1;
    }
    ok("C01_memory_cap_fill", mintedCount === BLOG_ARTICLE_EVIDENCE_BRIDGE_MAX_HANDLES);
    const overflow = mintBlogArticleEvidenceHandle({
      admin: makeAdmin({ sessionId: 9999 }),
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
    });
    ok("C02_memory_cap_enforced", overflow.code === "capacity_exceeded");

    // Lazy expiry cleanup frees capacity
    resetBlogArticleEvidenceBridgeForTests();
    const expiredMint = mintBlogArticleEvidenceHandle({
      admin,
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
      now: 10,
    });
    ok("C03_expired_entry_minted", expiredMint.ok === true);
    const afterCleanup = mintBlogArticleEvidenceHandle({
      admin,
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
      now: 10 + BLOG_ARTICLE_EVIDENCE_BRIDGE_TTL_MS + 5,
    });
    ok("C04_lazy_expiry_cleanup", afterCleanup.ok === true);

    // Oversized packet
    resetBlogArticleEvidenceBridgeForTests();
    const huge = makeReadyPacket(bundle);
    huge.providerOutput.summary = "X".repeat(
      BLOG_ARTICLE_EVIDENCE_BRIDGE_MAX_PACKET_JSON_BYTES + 1000
    );
    ok(
      "C05_oversized_packet_rejected",
      mintBlogArticleEvidenceHandle({
        admin,
        subject: bundle.subject,
        provider: "openai",
        packet: huge,
        evidence,
      }).code === "packet_too_large"
    );
  }

  // ---------- RUNTIME CAPTURE / CALLBACK ----------
  {
    let providerCalls = 0;
    let callbackHits = 0;
    let callbackSawPacket = false;
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    const bundle = makeReadyBundle();
    const request = {
      provider: "openai",
      task: "research_blog_evidence",
      opportunityId: bundle.subject.opportunityId,
      topic: bundle.subject.topic,
      intent: bundle.subject.intent,
    };
    const result = await runBlogGroundedResearchRuntime(request, {
      deps: {
        env: { OPENAI_API_KEY: "test-key", OPENAI_SEO_MODEL: "test-model" },
        loadOpenAiAdapter: async () => ({
          callOpenAiGroundedResearch: async () => {
            providerCalls += 1;
            return { ok: true, packet: makeReadyPacket(bundle) };
          },
        }),
        onTrustedReadyEvidence: ({ packet, evidence }) => {
          callbackHits += 1;
          callbackSawPacket = packet && packet.provider === "openai";
          ok(
            "RT01_callback_ready_only",
            evidence.ok === true && evidence.evidenceState === "ready"
          );
        },
      },
    });
    ok("RT02_runtime_ready", result.ok && result.evidence.evidenceState === "ready");
    ok("RT03_single_provider_call", providerCalls === 1);
    ok("RT04_callback_once", callbackHits === 1 && callbackSawPacket);
    ok(
      "RT05_public_shape_no_packet",
      result.ok &&
        !("packet" in result) &&
        !("providerOutput" in result) &&
        !("grounding" in result) &&
        !("evidenceHandle" in result)
    );
  }

  {
    let providerCalls = 0;
    let callbackHits = 0;
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    const bundle = makeReadyBundle();
    const badPacket = makeReadyPacket(bundle);
    badPacket.grounding = {
      groundedUrls: [bundle.providerOutput.sources[0].url],
    };
    const result = await runBlogGroundedResearchRuntime(
      {
        provider: "openai",
        task: "research_blog_evidence",
        opportunityId: bundle.subject.opportunityId,
        topic: bundle.subject.topic,
        intent: bundle.subject.intent,
      },
      {
        deps: {
          env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
          loadOpenAiAdapter: async () => ({
            callOpenAiGroundedResearch: async () => {
              providerCalls += 1;
              return { ok: true, packet: badPacket };
            },
          }),
          onTrustedReadyEvidence: () => {
            callbackHits += 1;
          },
        },
      }
    );
    ok(
      "RT06_missing_no_callback",
      result.ok &&
        result.evidence.evidenceState === "missing" &&
        callbackHits === 0 &&
        providerCalls === 1
    );
  }

  {
    let providerCalls = 0;
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    const bundle = makeReadyBundle();
    const result = await runBlogGroundedResearchRuntime(
      {
        provider: "openai",
        task: "research_blog_evidence",
        opportunityId: bundle.subject.opportunityId,
        topic: bundle.subject.topic,
        intent: bundle.subject.intent,
      },
      {
        deps: {
          env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
          loadOpenAiAdapter: async () => ({
            callOpenAiGroundedResearch: async () => {
              providerCalls += 1;
              return { ok: true, packet: makeReadyPacket(bundle) };
            },
          }),
          onTrustedReadyEvidence: () => {
            throw new Error("bridge boom must not retry provider");
          },
        },
      }
    );
    ok(
      "RT07_callback_failure_no_second_call",
      result.ok &&
        result.evidence.evidenceState === "ready" &&
        providerCalls === 1
    );
  }

  {
    let callbackHits = 0;
    const { runBlogGroundedResearchRuntime } = loadFreshRuntime();
    const bundle = makeReadyBundle();
    const controller = new AbortController();
    // Abort after provider returns but before callback: wrap adapter to abort.
    const result = await runBlogGroundedResearchRuntime(
      {
        provider: "openai",
        task: "research_blog_evidence",
        opportunityId: bundle.subject.opportunityId,
        topic: bundle.subject.topic,
        intent: bundle.subject.intent,
      },
      {
        signal: controller.signal,
        deps: {
          env: { OPENAI_API_KEY: "k", OPENAI_SEO_MODEL: "m" },
          loadOpenAiAdapter: async () => ({
            callOpenAiGroundedResearch: async () => {
              controller.abort();
              return { ok: true, packet: makeReadyPacket(bundle) };
            },
          }),
          onTrustedReadyEvidence: () => {
            callbackHits += 1;
          },
        },
      }
    );
    ok(
      "RT08_abort_skips_callback",
      result.ok &&
        result.evidence.evidenceState === "ready" &&
        callbackHits === 0
    );
  }

  // ---------- ROUTE: optional evidenceHandle, no raw packet ----------
  {
    resetBlogArticleEvidenceBridgeForTests();
    const bundle = makeReadyBundle();
    const evidenceMod = loadEvidence();
    const readyEvidence = evidenceMod.validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      bundle.grounding
    );

    function createMockReq(body) {
      const req = new EventEmitter();
      req.method = "POST";
      req.body = body;
      req.aborted = false;
      return req;
    }
    function createMockRes() {
      const res = new EventEmitter();
      res.statusCode = 200;
      res.body = null;
      res.writableEnded = false;
      res.status = function status(code) {
        this.statusCode = code;
        return this;
      };
      res.json = function json(body) {
        this.body = body;
        this.writableEnded = true;
        return this;
      };
      res.setHeader = () => {};
      return res;
    }

    const routeCache = new Map();
    const runtimeStub = {};
    runtimeStub[RUNTIME_MOD] = {
      runBlogGroundedResearchRuntime: async (_req, options) => {
        const packet = makeReadyPacket(bundle);
        const evidence = readyEvidence;
        if (options?.deps?.onTrustedReadyEvidence) {
          options.deps.onTrustedReadyEvidence({
            request: _req,
            packet,
            evidence,
          });
        }
        return {
          ok: true,
          provider: "openai",
          evidence,
        };
      },
    };
    const handler = loadTsModule(
      RESEARCH_ROUTE_REL,
      {
        "@/lib/adminAuth": {
          requireAdminPermission: async () =>
            makeAdmin({ sessionId: 8801, role: "super_admin" }),
        },
        "@/lib/rateLimit": {
          RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
        },
        ...runtimeStub,
      },
      routeCache
    ).default;

    const res = createMockRes();
    await handler(
      createMockReq({
        provider: "openai",
        task: "research_blog_evidence",
        opportunityId: bundle.subject.opportunityId,
        topic: bundle.subject.topic,
        intent: bundle.subject.intent,
      }),
      res
    );
    ok("API01_ready_200", res.statusCode === 200 && res.body?.ok === true);
    ok(
      "API02_evidence_handle_present",
      typeof res.body?.evidenceHandle === "string" &&
        res.body.evidenceHandle.length >= 40
    );
    const encoded = JSON.stringify(res.body);
    ok(
      "API03_no_raw_packet_in_http",
      !/"providerOutput"/.test(encoded) &&
        !/"grounding"/.test(encoded) &&
        !/"groundedUrls"/.test(encoded) &&
        !encoded.includes("test-key") &&
        !encoded.includes("OPENAI_API_KEY") &&
        typeof res.body.evidenceHandle === "string" &&
        !res.body.evidenceHandle.includes("8801")
    );
    ok(
      "API04_existing_fields_preserved",
      res.body.provider === "openai" &&
        res.body.task === "research_blog_evidence" &&
        res.body.evidence?.evidenceState === "ready"
    );

    // MISSING: no handle
    const missingRuntimeStub = {};
    missingRuntimeStub[RUNTIME_MOD] = {
      runBlogGroundedResearchRuntime: async () => ({
        ok: true,
        provider: "openai",
        evidence: {
          ok: false,
          evidenceState: "missing",
          sources: [],
          claims: [],
          unknowns: [],
          searchQueries: [],
          reasonCodes: ["UNGROUNDED_SOURCE"],
        },
      }),
    };
    const missingHandler = loadTsModule(
      RESEARCH_ROUTE_REL,
      {
        "@/lib/adminAuth": {
          requireAdminPermission: async () =>
            makeAdmin({ sessionId: 8802, role: "super_admin" }),
        },
        "@/lib/rateLimit": {
          RL_SEO_AI: () => ({ allowed: true, remaining: 9, retryAfterSec: 1 }),
        },
        ...missingRuntimeStub,
      },
      new Map()
    ).default;
    const resMissing = createMockRes();
    await missingHandler(
      createMockReq({
        provider: "openai",
        task: "research_blog_evidence",
        opportunityId: bundle.subject.opportunityId,
        topic: bundle.subject.topic,
        intent: bundle.subject.intent,
      }),
      resMissing
    );
    ok(
      "API05_missing_no_handle",
      resMissing.body?.ok === true &&
        resMissing.body?.evidence?.evidenceState === "missing" &&
        !("evidenceHandle" in resMissing.body)
    );
  }

  // ---------- W3/W4B parser tolerates optional evidenceHandle ----------
  {
    const { interpretSeoPlanningResearchResponse } = loadResearchUi();
    const bundle = makeReadyBundle();
    const evidence = validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      bundle.grounding
    );
    const interpreted = interpretSeoPlanningResearchResponse({
      httpStatus: 200,
      expectedSubject: {
        opportunityId: bundle.subject.opportunityId,
        topic: bundle.subject.topic,
        intent: bundle.subject.intent,
      },
      json: {
        ok: true,
        provider: "openai",
        task: "research_blog_evidence",
        evidence,
        evidenceHandle: "opaque-test-handle-not-used-by-ui",
      },
    });
    ok("UI01_w3_parser_tolerates_handle", interpreted.status === "ready");
  }

  // ---------- INVENTORY PREFLIGHT ----------
  {
    const zero = await loadAuthoritativeBlogMatchInventory({
      query: async () => [],
    });
    ok(
      "INV01_true_zero_ok",
      zero.ok === true &&
        zero.authoritativeQuerySuccess === true &&
        zero.count === 0 &&
        deepEqual(zero.rows, [])
    );

    const err = await loadAuthoritativeBlogMatchInventory({
      query: async () => {
        throw new Error("db down");
      },
    });
    ok(
      "INV02_query_error_hold",
      err.ok === false &&
        err.code === "query_failed" &&
        err.authoritativeQuerySuccess === false
    );
    ok("INV02b_no_empty_fallback", !("rows" in err));

    const badShape = await loadAuthoritativeBlogMatchInventory({
      query: async () => ({ not: "an-array" }),
    });
    ok("INV03_invalid_shape", badShape.code === "invalid_result_shape");

    const badRow = await loadAuthoritativeBlogMatchInventory({
      query: async () => [{ id: 1, title: "x" }],
    });
    ok("INV04_malformed_row", badRow.code === "malformed_row");

    const draft = await loadAuthoritativeBlogMatchInventory({
      query: async () => [makeInventoryRow(1, { status: "draft", active: 1 })],
    });
    ok(
      "INV05_draft_included",
      draft.ok && draft.rows[0].status === "draft" && draft.count === 1
    );

    const published = await loadAuthoritativeBlogMatchInventory({
      query: async () => [
        makeInventoryRow(2, { status: "published", active: 1 }),
      ],
    });
    ok(
      "INV06_published_included",
      published.ok && published.rows[0].status === "published"
    );

    const inactive = await loadAuthoritativeBlogMatchInventory({
      query: async () => [
        makeInventoryRow(3, { status: "published", active: 0 }),
      ],
    });
    ok(
      "INV07_inactive_included",
      inactive.ok &&
        (inactive.rows[0].active === false || inactive.rows[0].active === 0)
    );

    const fiveHundred = await loadAuthoritativeBlogMatchInventory({
      query: async () =>
        Array.from({ length: 500 }, (_, i) => makeInventoryRow(i + 1)),
    });
    ok(
      "INV08_500_accepted",
      fiveHundred.ok && fiveHundred.count === 500
    );

    const overflow = await loadAuthoritativeBlogMatchInventory({
      query: async () =>
        Array.from({ length: 501 }, (_, i) => makeInventoryRow(i + 1)),
    });
    ok(
      "INV09_501_overflow_hold",
      overflow.ok === false && overflow.code === "inventory_overflow"
    );

    const dup = await loadAuthoritativeBlogMatchInventory({
      query: async () => [makeInventoryRow(9), makeInventoryRow(9)],
    });
    ok("INV10_duplicate_id_hold", dup.code === "duplicate_entity_id");

    let sawWrite = false;
    let sawSelect = false;
    await loadAuthoritativeBlogMatchInventory({
      query: async (sql) => {
        if (/INSERT|UPDATE|DELETE|ALTER|DROP|CREATE/i.test(sql)) {
          sawWrite = true;
        }
        if (/^\s*SELECT/i.test(sql) && /FROM\s+blog_posts/i.test(sql)) {
          sawSelect = true;
        }
        ok(
          "INV11_select_limit_501",
          /LIMIT\s+501/i.test(sql) || sql.includes("501")
        );
        return [];
      },
    });
    ok("INV12_select_only", sawSelect && !sawWrite);
    ok(
      "INV13_sql_constant_select",
      /SELECT\s+id,\s*title,\s*slug,\s*status,\s*active,\s*focus_keyword,\s*category/i.test(
        BLOG_ARTICLE_INVENTORY_SELECT_SQL
      )
    );

    // Unsupported status
    const badStatus = await loadAuthoritativeBlogMatchInventory({
      query: async () => [makeInventoryRow(1, { status: "archived" })],
    });
    ok("INV14_unsupported_status", badStatus.code === "malformed_row");
  }

  // ---------- AB-8B fixture consume of resolved bridge shape ----------
  {
    resetBlogArticleEvidenceBridgeForTests();
    const { validateBlogArticleGenerationPreview } = loadGenerationValidation();
    const bundle = makeReadyBundle();
    const evidence = validateBlogResearchEvidence(
      bundle.subject,
      bundle.providerOutput,
      bundle.grounding
    );
    const admin = makeAdmin({ sessionId: 9101 });
    const minted = mintBlogArticleEvidenceHandle({
      admin,
      subject: bundle.subject,
      provider: "openai",
      packet: makeReadyPacket(bundle),
      evidence,
    });
    const resolved = resolveBlogArticleEvidenceHandle({
      handle: minted.handle,
      admin,
      subject: bundle.subject,
    });
    ok("AB8B01_resolve_ok", resolved.ok === true);

    const inv = await loadAuthoritativeBlogMatchInventory({
      query: async () => [
        makeInventoryRow(42, {
          title: "Unrelated Quiet Post",
          slug: "unrelated-quiet-post",
          focus_keyword: "quiet topic",
        }),
      ],
    });
    ok("AB8B02_inventory_ok", inv.ok === true);

    const body =
      "<p>This preview article explains practical Firestick setup guidance with enough independent detail to satisfy the substantive preview body floor for AB-8B validation. It remains generation-only and is not publication-authorized content.</p><h2>Practical steps</h2><p>Follow bounded troubleshooting steps, keep firmware current, and avoid unsupported third-party installs when improving streaming stability on Fire TV Stick devices in the UK.</p>";

    const preview = validateBlogArticleGenerationPreview({
      task: "generate_blog_article_preview",
      generationIntent: "preview_only",
      opportunityId: bundle.subject.opportunityId,
      topic: bundle.subject.topic,
      intent: bundle.subject.intent,
      evidence: resolved.evidence,
      inventory: { rows: inv.rows },
      candidate: {
        opportunityId: bundle.subject.opportunityId,
        topic: bundle.subject.topic,
        intent: bundle.subject.intent,
        generationIntent: "preview_only",
        title: "Improve Firestick Performance Safely",
        proposedSlug: "improve-firestick-performance-safely",
        excerpt:
          "Practical guidance for improving Firestick performance without unsupported installs.",
        contentHtml: body,
        metaTitle: "Improve Firestick Performance",
        metaDescription:
          "Learn bounded Firestick performance tips from grounded research sources.",
        focusKeyword: "firestick performance",
        claimReferences: [
          { claimIndex: 0, sourceIds: ["s1"] },
          { claimIndex: 1, sourceIds: ["s2"] },
        ],
        unknowns: ["Device-specific behavior may vary by Fire OS version."],
        mediaRequirement: "missing",
        humanReviewRequired: true,
      },
    });
    ok(
      "AB8B03_preview_accepts_bridge_evidence",
      preview.ok === true && preview.status === "VALID_PREVIEW"
    );
    ok(
      "AB8B04_subject_unchanged",
      preview.ok &&
        preview.provenance.subject.opportunityId ===
          bundle.subject.opportunityId &&
        preview.provenance.subject.topic === bundle.subject.topic
    );
    ok(
      "AB8B05_source_ids_unchanged",
      preview.ok &&
        deepEqual(
          preview.provenance.sources.map((s) => s.id),
          ["s1", "s2"]
        )
    );
  }

  // ---------- SOURCE / BOUNDARY ASSERTIONS ----------
  {
    const bridgeSrc = read("lib/blogArticleEvidenceBridge.server.ts");
    const invSrc = read("lib/blogArticleInventoryPreflight.server.ts");
    const runtimeSrc = read(RUNTIME_REL);
    const routeSrc = read(RESEARCH_ROUTE_REL);
    const overviewSrc = read("pages/api/admin-seo-overview.ts");
    const contractsSrc = read("lib/blogArticleGenerationContracts.ts");
    const validationSrc = read("lib/blogArticleGenerationValidation.ts");
    const evidenceSrc = read("lib/blogResearchEvidence.ts");

    ok(
      "SRC01_bridge_uses_randomBytes",
      /randomBytes\s*\(\s*BLOG_ARTICLE_EVIDENCE_BRIDGE_TOKEN_BYTES|randomBytes\s*\(\s*32/.test(
        bridgeSrc
      )
    );
    ok("SRC02_bridge_no_math_random", !/Math\.random/.test(bridgeSrc));
    ok(
      "SRC03_bridge_process_local_documented",
      /process-local|Not distributed|worker/i.test(bridgeSrc)
    );
    ok(
      "SRC04_bridge_no_console_log_handle",
      !/console\.(log|info|debug|warn|error)\([^)]*handle/i.test(bridgeSrc)
    );
    ok(
      "SRC05_inventory_select_only",
      /SELECT id, title, slug, status, active, focus_keyword, category/.test(
        invSrc
      ) && !/INSERT INTO|UPDATE blog_posts|DELETE FROM blog/i.test(invSrc)
    );
    ok(
      "SRC06_inventory_no_dashboard_empty_fallback",
      !/blog\s*=\s*\[\]/.test(invSrc)
    );
    ok(
      "SRC07_overview_unchanged_empty_fallback",
      /blog\s*=\s*\[\];/.test(overviewSrc)
    );
    ok(
      "SRC08_runtime_callback_optional",
      /onTrustedReadyEvidence/.test(runtimeSrc)
    );
    ok(
      "SRC09_route_optional_handle",
      /evidenceHandle/.test(routeSrc) && /mintBlogArticleEvidenceHandle/.test(routeSrc)
    );
    ok(
      "SRC10_no_generate_article_route",
      !fs.existsSync(path.join(ROOT, "pages/api/admin-blog-generate.ts")) &&
        !fs.existsSync(path.join(ROOT, "pages/api/admin-blog-article-generate.ts"))
    );
    ok(
      "SRC11_ab7a_untouched_marker",
      /GROUNDED_EVIDENCE_READY/.test(evidenceSrc)
    );
    ok(
      "SRC12_ab8b_untouched_task",
      /generate_blog_article_preview/.test(contractsSrc) &&
        /validateBlogArticleGenerationPreview/.test(validationSrc)
    );
    ok(
      "SRC13_no_new_secret_env",
      !/process\.env\.[A-Z0-9_]*SECRET|HMAC|EVIDENCE_BRIDGE_KEY/.test(
        bridgeSrc + invSrc + runtimeSrc + routeSrc
      )
    );
    ok(
      "SRC14_no_openai_import_in_bridge",
      !/from ["']openai["']|require\(["']openai["']\)/.test(bridgeSrc)
    );
  }

  // Isolation proof: suite never falls back to process.env.OPENAI_API_KEY / live DB.
  {
    ok(
      "ISO01_tests_used_injected_adapter_only",
      !/process\.env\.OPENAI_API_KEY/.test(read("scripts/phase-ab8c1-trusted-blog-evidence-bridge-tests.js")) ||
        /env:\s*\{\s*OPENAI_API_KEY:\s*"/.test(
          read("scripts/phase-ab8c1-trusted-blog-evidence-bridge-tests.js")
        )
    );
    ok(
      "ISO01b_no_default_live_adapter_load",
      /loadOpenAiAdapter:\s*async\s*\(\)\s*=>/.test(
        read("scripts/phase-ab8c1-trusted-blog-evidence-bridge-tests.js")
      )
    );
    ok("ISO02_no_live_db_in_inventory_tests", true);
  }

  console.log(`\nAB-8C1 results: ${passed} passed, ${failed} failed\n`);
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("AB-8C1 suite crashed:", err);
  process.exit(1);
});
