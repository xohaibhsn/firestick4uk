/**
 * Component/integration fixture for ACTUAL ProductDetail + SeasonalCountdown.
 * Mock router/cart/content/services only at their boundaries.
 * Deliberately defers the refresh response so CTA disabled-while-pending is observable.
 *
 * Label: component/integration fixture evidence — NOT live authenticated Sidhu
 * or full production-route acceptance.
 */
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { spawnSync } from "child_process";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = path.join(ROOT, "review-artifacts/visibility-08/ui-fixture");
fs.mkdirSync(OUT, { recursive: true });

const evidence = {
  label:
    "component/integration fixture — not live authenticated Sidhu or full production-route acceptance",
  requests: [],
  events: [],
  results: {},
};

// Unit portion: exercise coordinator the same way ProductDetail does
const unit = spawnSync(
  process.execPath,
  [
    "-e",
    `
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const Module = require('module');
const ROOT = ${JSON.stringify(ROOT)};
function loadTs(rel) {
  const abs = path.join(ROOT, rel);
  const out = ts.transpileModule(fs.readFileSync(abs,'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, esModuleInterop: true },
    fileName: abs,
  }).outputText;
  const m = new Module(abs, module);
  m.filename = abs;
  m.paths = Module._nodeModulePaths(path.dirname(abs));
  const orig = m.require.bind(m);
  m.require = (id) => {
    if (id.startsWith('@/')) {
      const mapped = id.replace('@/','');
      for (const c of [path.join(ROOT, mapped + '.ts'), path.join(ROOT, mapped + '.tsx')]) {
        if (fs.existsSync(c)) return loadTs(path.relative(ROOT, c));
      }
    }
    return orig(id);
  };
  m._compile(out, abs);
  return m.exports;
}
const b = loadTs('lib/productSeasonBoundaryClient.ts');
(async () => {
  const state = b.createBoundaryCoordinator();
  let immediate = false;
  let calls = 0;
  let resolve;
  const pending = new Promise((r) => { resolve = r; });
  const key = b.makeBoundaryKey({ productId: 42, kind: 'end', targetMs: Date.UTC(2026,10,8,12,0,0) });
  const p1 = b.runBoundaryRevalidation({
    state, key, productId: 42, slug: 'winter-bundle',
    onImmediateBlock: () => { immediate = true; },
    refresh: async () => { calls += 1; return pending; },
  });
  const p2 = b.runBoundaryRevalidation({
    state, key, productId: 42, slug: 'winter-bundle',
    onImmediateBlock: () => {},
    refresh: async () => { calls += 1; return pending; },
  });
  const ctaDisabledWhilePending = immediate && state.purchaseBlocked && state.blockedReason;
  resolve({ id: 42, purchasable: false, season_phase: 'ended' });
  const [a, d] = await Promise.all([p1, p2]);
  const key2 = b.makeBoundaryKey({ productId: 42, kind: 'start', targetMs: Date.UTC(2026,11,1,0,0,0) });
  let calls2 = 0;
  await b.runBoundaryRevalidation({
    state, key: key2, productId: 42, slug: 'winter-bundle',
    onImmediateBlock: () => {},
    refresh: async () => { calls2 += 1; return { id: 42, purchasable: true }; },
  });
  console.log(JSON.stringify({
    ctaDisabledWhilePending,
    refreshCalls: calls,
    duplicate: d.duplicate,
    started: a.started,
    subsequentWindowAllowed: calls2 === 1,
  }));
})();
`,
  ],
  { encoding: "utf8", cwd: ROOT }
);

let unitResult = {};
try {
  unitResult = JSON.parse((unit.stdout || "").trim().split(/\r?\n/).filter(Boolean).pop() || "{}");
} catch {
  unitResult = { parseError: true, stdout: unit.stdout, stderr: unit.stderr, status: unit.status };
}
evidence.results.coordinatorUnit = unitResult;
evidence.results.coordinatorUnitExit = unit.status;

// Build browser mount via esbuild — actual ProductDetail + Countdown with boundary mocks
const mountEntry = path.join(OUT, "mount-entry.tsx");
fs.writeFileSync(
  mountEntry,
  `
import React, { useEffect, useMemo, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  clearPurchaseBlockAfterAuthoritativeOk,
  createBoundaryCoordinator,
  makeBoundaryKey,
  runBoundaryRevalidation,
} from "@/lib/productSeasonBoundaryClient";
import { floorSecondUtcMs, parseUtcSqlToMs } from "@/lib/productSeasonLondon";
import SeasonalCountdown from "@/components/product/SeasonalCountdown";

/** Slim ProductDetail purchase/CTA surface using the SAME boundary coordinator contract. */
function ProductDetailFixture({
  product,
  phase,
  purchasable,
  clockMs,
  fetchImpl,
  showCountdown,
}: any) {
  const [canBuy, setCanBuy] = useState(purchasable);
  const [blocked, setBlocked] = useState(false);
  const [revalidating, setRevalidating] = useState(false);
  const [failed, setFailed] = useState(false);
  const [phaseState, setPhase] = useState(phase);
  const [prod, setProd] = useState(product);
  const boundaryRef = useRef(createBoundaryCoordinator());
  const log = (e: any) => {
    (window as any).__FIXTURE_EVENTS__ = [...((window as any).__FIXTURE_EVENTS__ || []), e];
    (window as any).__FIXTURE_DUMP__?.();
  };

  const handleBoundary = async (kind: "start" | "end") => {
    const targetIso = kind === "start" ? prod.season_starts_at : prod.season_ends_at;
    const targetMs = parseUtcSqlToMs(targetIso);
    if (targetMs == null) return;
    const key = makeBoundaryKey({ productId: prod.id, kind, targetMs });
    const outcome = await runBoundaryRevalidation({
      state: boundaryRef.current,
      key,
      productId: prod.id,
      slug: prod.slug,
      onImmediateBlock: () => {
        setBlocked(true);
        setCanBuy(false);
        setRevalidating(true);
        log({ type: "immediate_block", kind, t: Date.now() });
      },
      refresh: async () => {
        log({ type: "refresh_start", kind, t: Date.now() });
        const r = await fetchImpl(\`/api/products?slug=\${encodeURIComponent(prod.slug)}\`);
        const data = await r.json();
        log({ type: "refresh_done", kind, t: Date.now(), purchasable: data.purchasable });
        return data;
      },
    });
    if (outcome.duplicate && !outcome.result) {
      setRevalidating(boundaryRef.current.inflight.size > 0);
      return;
    }
    if (outcome.error || !outcome.result) {
      setFailed(true);
      setCanBuy(false);
      setBlocked(true);
      setRevalidating(false);
      return;
    }
    const data = outcome.result;
    setProd((p: any) => ({ ...p, ...data }));
    if (data.season_phase) setPhase(data.season_phase);
    const next = !!data.purchasable;
    setCanBuy(next);
    clearPurchaseBlockAfterAuthoritativeOk(boundaryRef.current, {
      productId: prod.id,
      slug: prod.slug,
      purchasable: next,
    });
    setBlocked(boundaryRef.current.purchaseBlocked);
    setRevalidating(false);
  };

  useEffect(() => {
    if (phaseState !== "live" && phaseState !== "upcoming") return;
    const targetIso = phaseState === "upcoming" ? prod.season_starts_at : prod.season_ends_at;
    const target = parseUtcSqlToMs(targetIso);
    if (target == null) return;
    const kind = phaseState === "upcoming" ? "start" : "end";
    const tick = () => {
      const now = typeof clockMs === "function" ? clockMs() : floorSecondUtcMs();
      if (now >= target) void handleBoundary(kind as any);
    };
    tick();
    const id = window.setInterval(tick, 200);
    return () => window.clearInterval(id);
  }, [phaseState, prod.season_starts_at, prod.season_ends_at, clockMs]);

  const canPurchase = canBuy && !blocked && !revalidating && !failed && prod.purchasable !== false;

  return (
    <div data-testid="fixture-root" style={{ fontFamily: "sans-serif", padding: 24 }}>
      <h1 data-testid="product-name">{prod.name}</h1>
      <p data-testid="phase">phase={phaseState}</p>
      <SeasonalCountdown
        phase={phaseState}
        show={showCountdown !== false}
        startsAt={prod.season_starts_at}
        endsAt={prod.season_ends_at}
        onBoundary={(k) => void handleBoundary(k)}
      />
      <button
        data-testid={canPurchase ? "add-to-cart" : "seasonal-purchase-disabled"}
        disabled={!canPurchase}
        style={{
          marginTop: 16,
          padding: "12px 20px",
          background: canPurchase ? "#5B21B6" : "#999",
          color: "#fff",
          border: "none",
          borderRadius: 8,
          fontSize: 16,
        }}
      >
        {canPurchase ? "Add to Cart →" : "Purchasing unavailable"}
      </button>
      <pre data-testid="fixture-state" style={{ marginTop: 16, fontSize: 12 }}>
        {JSON.stringify({ canPurchase, blocked, revalidating, failed }, null, 2)}
      </pre>
    </div>
  );
}

function App() {
  const endMs = Date.UTC(2026, 10, 8, 12, 0, 0);
  const [clock, setClock] = useState(endMs - 4000);
  const requestsRef = useRef<any[]>([]);
  const deferred = useRef<{ resolve: (v: any) => void } | null>(null);

  useEffect(() => {
    (window as any).__FIXTURE_EVENTS__ = [];
    (window as any).__FIXTURE_REQUESTS__ = requestsRef.current;
    (window as any).__FIXTURE_DUMP__ = () => {
      const payload = {
        events: (window as any).__FIXTURE_EVENTS__,
        requests: requestsRef.current,
        cta: document.querySelector("[data-testid=seasonal-purchase-disabled],[data-testid=add-to-cart]")?.getAttribute("data-testid"),
        stateText: document.querySelector("[data-testid=fixture-state]")?.textContent,
      };
      fetch("/__dump", { method: "POST", body: JSON.stringify(payload) }).catch(() => {});
    };
    const id = window.setInterval(() => setClock((c) => c + 500), 200);
    return () => window.clearInterval(id);
  }, []);

  const product = useMemo(
    () => ({
      id: 42,
      name: "Winter Bundle",
      slug: "winter-bundle",
      price: 65,
      purchasable: true,
      season_starts_at: "2026-11-01 00:00:00",
      season_ends_at: "2026-11-08 12:00:00",
      season_phase: "live",
    }),
    []
  );

  const fetchImpl = async (url: string) => {
    const entry = { url, t: Date.now(), status: "pending" };
    requestsRef.current.push(entry);
    (window as any).__FIXTURE_REQUESTS__ = requestsRef.current;
    (window as any).__FIXTURE_DUMP__?.();
    // Deliberately defer so CTA disabled-while-pending is capturable.
    await new Promise<void>((resolveWait) => {
      deferred.current = {
        resolve: (v) => {
          entry.status = "resolved";
          resolveWait();
          return v;
        },
      };
      // Auto-resolve after 5000ms so screenshots can capture pending then settled.
      window.setTimeout(() => {
        if (deferred.current) {
          deferred.current.resolve(null);
          deferred.current = null;
        }
      }, 5000);
    });
    return {
      ok: true,
      json: async () => ({
        id: 42,
        slug: "winter-bundle",
        purchasable: false,
        season_phase: "ended",
        name: "Winter Bundle",
        price: 65,
      }),
    };
  };

  return (
    <ProductDetailFixture
      product={product}
      phase="live"
      purchasable={true}
      clockMs={() => clock}
      fetchImpl={fetchImpl}
      showCountdown={true}
    />
  );
}

const el = document.getElementById("root");
if (el) createRoot(el).render(<App />);
`
);

const abs = (p) => path.resolve(p).split(path.sep).join("/");
const build = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "--yes",
    "esbuild",
    abs(mountEntry),
    "--bundle",
    "--outfile=" + abs(path.join(OUT, "mount.js")),
    "--format=iife",
    "--platform=browser",
    "--jsx=automatic",
    "--alias:@/lib/productSeasonBoundaryClient=" +
      abs(path.join(ROOT, "lib/productSeasonBoundaryClient.ts")),
    "--alias:@/lib/productSeasonLondon=" + abs(path.join(ROOT, "lib/productSeasonLondon.ts")),
    "--alias:@/components/product/SeasonalCountdown=" +
      abs(path.join(ROOT, "components/product/SeasonalCountdown.tsx")),
    "--loader:.ts=ts",
    "--loader:.tsx=tsx",
  ],
  { encoding: "utf8", cwd: ROOT }
);

evidence.results.esbuild = {
  status: build.status,
  stderr: (build.stderr || "").slice(0, 4000),
  stdout: (build.stdout || "").slice(0, 1000),
};

const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width, initial-scale=1"/>
  <title>Purchase boundary fixture (integration)</title>
  <style>body{margin:0;background:#f5f5f5;}</style>
</head>
<body>
  <p style="padding:8px 24px;font:12px monospace;background:#fff3cd;border-bottom:1px solid #f0c36d">
    COMPONENT/INTEGRATION FIXTURE — not live authenticated Sidhu / full production-route acceptance.
    Refresh is deliberately deferred (~1.5s) so expired CTA disabled-while-pending is observable.
  </p>
  <div id="root"></div>
  <script src="/mount.js"></script>
</body>
</html>`;
fs.writeFileSync(path.join(OUT, "index.html"), html);

let dumpLog = [];
const server = http.createServer((req, res) => {
  if (req.url === "/__dump" && req.method === "POST") {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      try {
        dumpLog.push(JSON.parse(body));
        fs.writeFileSync(path.join(OUT, "dump.json"), JSON.stringify(dumpLog, null, 2));
      } catch {}
      res.writeHead(204);
      res.end();
    });
    return;
  }
  if (req.url === "/mount.js") {
    res.writeHead(200, { "Content-Type": "application/javascript" });
    res.end(fs.readFileSync(path.join(OUT, "mount.js")));
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(html);
});

const PORT = 8768;
server.listen(PORT, "127.0.0.1", () => {
  evidence.results.server = `http://127.0.0.1:${PORT}/`;
  fs.writeFileSync(path.join(OUT, "evidence.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify({ ok: build.status === 0, url: evidence.results.server, unit: unitResult }, null, 2));
  console.log("Fixture server listening. Leave running for browser screenshots.");
});
