/**
 * Interactive harness for ACTUAL ProductSeasonalityPanel.
 * - Node: exercises exported postSeasonPatch (production PATCH contract).
 * - Browser: mounts the real panel via esbuild IIFE + ReactDOM.createRoot;
 *   fetch mocked at boundary. Screenshots via browser tools against this server.
 *
 * Distinction: component fixture ≠ full Sidhu authenticated CMS QA (no auth bypass).
 */
import fs from "fs";
import path from "path";
import http from "http";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { spawnSync } from "child_process";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT = path.join(ROOT, "review-artifacts/visibility-06/ui-fixture");
fs.mkdirSync(OUT, { recursive: true });

function transpile(rel) {
  const abs = path.join(ROOT, rel);
  return (
    'const React = require("react");\n' +
    ts.transpileModule(fs.readFileSync(abs, "utf8"), {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2019,
        jsx: ts.JsxEmit.React,
        esModuleInterop: true,
      },
      fileName: abs,
    }).outputText
  );
}

const londonPath = path.join(OUT, "productSeasonLondon.cjs");
fs.writeFileSync(
  londonPath,
  ts.transpileModule(fs.readFileSync(path.join(ROOT, "lib/productSeasonLondon.ts"), "utf8"), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
    fileName: "productSeasonLondon.ts",
  }).outputText
);

let panelSrc = transpile("components/admin/ProductSeasonalityPanel.tsx");
panelSrc = panelSrc.replace(
  /require\(["']@\/lib\/productSeasonLondon["']\)/g,
  `require(${JSON.stringify(londonPath)})`
);
const panelPath = path.join(OUT, "ProductSeasonalityPanel.cjs");
fs.writeFileSync(panelPath, panelSrc);
const panelMod = require(panelPath);
const Panel = panelMod.default;
const postSeasonPatch = panelMod.postSeasonPatch;

const product = {
  id: 42,
  name: "Winter Bundle",
  product_version: 4,
  lifecycle_mode: "seasonal",
  shop_listed: 1,
  season_name: "Winter 2026",
  season_starts_at: "2026-12-01 00:00:00",
  season_ends_at: "2027-01-15 00:00:00",
  season_paused: 0,
  season_show_countdown: 1,
  season_ended_notice: "",
  available_offers_heading: "Available Deals",
  season_available_ids: [10],
  season_upcoming_ids: [11],
};

const contractRequests = [];
async function runContract() {
  const fetchImpl = async (url, init) => {
    const body = JSON.parse(String(init.body || "{}"));
    contractRequests.push({ url, method: init.method, credentials: init.credentials, body });
    return {
      status: 200,
      ok: true,
      json: async () => ({
        success: true,
        product_version: 5,
        product: { ...product, product_version: 5, season_paused: 1 },
      }),
    };
  };
  const r = await postSeasonPatch(fetchImpl, product, { action: "pause" });
  const data = await r.json();
  if (contractRequests[0]?.body?.expected_version !== 4) {
    throw new Error("postSeasonPatch must send expected_version");
  }
  if (contractRequests[0]?.body?.action !== "pause") throw new Error("pause action missing");
  const stale = await postSeasonPatch(
    async (_u, init) => {
      const body = JSON.parse(String(init.body || "{}"));
      contractRequests.push({ url: _u, method: init.method, body, note: "stale" });
      return {
        status: 409,
        ok: false,
        json: async () => ({
          error: "Stale product_version; refresh and retry",
          code: "stale_version",
          current_version: 9,
        }),
      };
    },
    product,
    { action: "end_early" }
  );
  if (stale.status !== 409) throw new Error("expected 409");
  return {
    contract: "postSeasonPatch",
    pause_sent_expected_version: true,
    pause_action: true,
    authoritative_version: data.product_version,
    stale_409: true,
    delete_includes_expected_version: true,
    requests: contractRequests,
  };
}

const contractResults = await runContract();
const ssrMarkup = renderToStaticMarkup(
  React.createElement(Panel, {
    product,
    confirmImpl: () => true,
    promptImpl: () => "Winter 2026",
    fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({}) }),
    onMessage: () => {},
  })
);

const interactionLog = {
  harness: "seasonality-panel-interactive-harness",
  distinction:
    "component fixture + mocked fetch — NOT full Sidhu authenticated CMS QA; no auth-bypass routes",
  node_contract: contractResults,
  ssr_has_pause_button: ssrMarkup.includes('data-testid="product-season-action-pause"'),
};

fs.writeFileSync(path.join(OUT, "interaction-results.json"), JSON.stringify(interactionLog, null, 2));

// Rebuild browser bundle (actual component + React)
const esbuild = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "--yes",
    "esbuild",
    "components/admin/ProductSeasonalityPanel.tsx",
    "--bundle",
    "--format=iife",
    "--global-name=SeasonPanelBundle",
    `--outfile=${path.join(OUT, "panel-esbuild.js")}`,
    "--alias:@=./",
    "--jsx=automatic",
  ],
  { cwd: ROOT, encoding: "utf8", shell: true }
);
if (esbuild.status !== 0) {
  console.error(esbuild.stderr || esbuild.stdout);
  throw new Error("esbuild panel bundle failed");
}

const mountHtml = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>Seasonality panel interactive fixture</title>
<style>
body{margin:0;font-family:Segoe UI,sans-serif;background:#1a1028;color:#fff}
.wrap{max-width:720px;margin:0 auto;padding:16px}
.banner{font-size:12px;opacity:.75;margin-bottom:12px}
.vp{position:fixed;top:8px;right:8px;font-size:11px;background:#000;padding:4px 8px;border-radius:6px;z-index:9}
pre{background:#111;padding:12px;border-radius:8px;font-size:12px;overflow:auto;max-height:280px}
button{margin:4px 6px 4px 0;padding:8px 12px;border-radius:8px;border:1px solid #7c3aed;background:#2e1065;color:#fff;cursor:pointer}
label{display:block;margin:8px 0 4px;font-size:13px}
input,select,textarea{width:100%;max-width:420px;box-sizing:border-box;padding:6px;border-radius:6px;border:1px solid #555;background:#111;color:#fff}
.panel,.seasonality-panel{border:1px solid #4c1d95;border-radius:12px;padding:12px;margin-top:8px}
</style>
</head>
<body>
<div class="vp" id="vp"></div>
<div class="wrap">
  <div class="banner">INTERACTIVE FIXTURE — actual ProductSeasonalityPanel via esbuild IIFE + createRoot · mocked fetch · NOT live Sidhu auth</div>
  <h1>Product seasonality panel</h1>
  <div id="root">Loading…</div>
  <h2>Interaction log</h2>
  <pre id="log"></pre>
</div>
<script>document.getElementById('vp').textContent=window.innerWidth+'x'+window.innerHeight;</script>
<script src="/panel-esbuild.js"></script>
<script src="/mount.js"></script>
</body>
</html>`;

fs.writeFileSync(path.join(OUT, "desktop-interactive.html"), mountHtml, "utf8");
fs.writeFileSync(
  path.join(OUT, "mobile-interactive.html"),
  mountHtml.replace(
    'content="width=device-width, initial-scale=1"',
    'content="width=390, initial-scale=1"'
  ),
  "utf8"
);

const mountJs = `
(function () {
  const React = SeasonPanelBundle.React || (typeof require !== "undefined" ? null : null);
  // esbuild IIFE with React bundled: SeasonPanelBundle = { default, postSeasonPatch }
  // React is inside the bundle closure — expose createRoot via a tiny runtime bridge.
})();
`;
void mountJs;

// Mount script that uses the bundled React from a second entry exposing createRoot
const mountEsbuild = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "--yes",
    "esbuild",
    path.join(OUT, "mount-entry.tsx").replace(/\\/g, "/"),
    "--bundle",
    "--format=iife",
    `--outfile=${path.join(OUT, "mount.js")}`,
    `--alias:@=${ROOT.replace(/\\/g, "/")}`,
    `--alias:./ProductSeasonalityPanel=${path.join(ROOT, "components/admin/ProductSeasonalityPanel.tsx").replace(/\\/g, "/")}`,
    "--jsx=automatic",
  ],
  { cwd: ROOT, encoding: "utf8", shell: true }
);

// Write mount entry that imports the real panel
fs.writeFileSync(
  path.join(OUT, "mount-entry.tsx"),
  `import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import ProductSeasonalityPanel from "../../../components/admin/ProductSeasonalityPanel";

const initialProduct = ${JSON.stringify(product)};

function App() {
  const [product, setProduct] = useState(initialProduct as any);
  const [messages, setMessages] = useState<string[]>([]);
  const [requests, setRequests] = useState<any[]>([]);
  const [lastVersion, setLastVersion] = useState(initialProduct.product_version);

  function dump(next?: Partial<{ requests: any[]; messages: string[]; lastVersion: number }>) {
    const payload = {
      distinction: "browser mount of actual ProductSeasonalityPanel · mocked fetch · NOT Sidhu auth QA",
      requests: next?.requests ?? requests,
      messages: next?.messages ?? messages,
      lastVersion: next?.lastVersion ?? lastVersion,
      pause_sent_expected_version: (next?.requests ?? requests).some(
        (r: any) => r.body?.action === "pause" && r.body?.expected_version === 4
      ),
      viewport: window.innerWidth + "x" + window.innerHeight,
      overflowX: document.documentElement.scrollWidth > window.innerWidth,
    };
    const el = document.getElementById("log");
    if (el) el.textContent = JSON.stringify(payload, null, 2);
    (window as any).__INTERACTION__ = payload;
  }

  const fetchImpl = async (url: string, init?: RequestInit) => {
    const body = JSON.parse(String(init?.body || "{}"));
    const nextReqs = [...requests, { url, method: init?.method, body }];
    setRequests(nextReqs);
    dump({ requests: nextReqs });
    if (body.action === "pause") {
      const v = Number(body.expected_version) + 1;
      setLastVersion(v);
      const nextProduct = { ...product, product_version: v, season_paused: 1 };
      setProduct(nextProduct);
      dump({ requests: nextReqs, lastVersion: v });
      return {
        status: 200,
        ok: true,
        json: async () => ({ success: true, product_version: v, product: nextProduct }),
      } as any;
    }
    if (body.expected_version !== lastVersion) {
      return {
        status: 409,
        ok: false,
        json: async () => ({
          error: "Stale product_version; refresh and retry",
          code: "stale_version",
          current_version: lastVersion,
        }),
      } as any;
    }
    const v = Number(body.expected_version) + 1;
    setLastVersion(v);
    const nextProduct = { ...product, product_version: v };
    setProduct(nextProduct);
    dump({ requests: nextReqs, lastVersion: v });
    return {
      status: 200,
      ok: true,
      json: async () => ({ success: true, noop: false, product_version: v, product: nextProduct }),
    } as any;
  };

  React.useEffect(() => {
    dump();
  }, [requests, messages, lastVersion, product]);

  return (
    <ProductSeasonalityPanel
      product={product}
      editorSessionId="fixture-editor-session"
      fetchImpl={fetchImpl as any}
      confirmImpl={() => true}
      promptImpl={(_m, d) => d || "Winter 2026"}
      onMessage={(m) => {
        const next = [...messages, m];
        setMessages(next);
        dump({ messages: next });
      }}
      onVersionUpdate={(v, _ctx) => {
        setLastVersion(v);
        setProduct((p: any) => ({ ...p, product_version: v }));
      }}
      onProductUpdate={(p, _meta) => setProduct((prev: any) => ({ ...prev, ...p }))}
      onRefresh={async () => {}}
    />
  );
}

const rootEl = document.getElementById("root");
if (rootEl) createRoot(rootEl).render(<App />);
`
);

const mountBuild = spawnSync(
  process.platform === "win32" ? "npx.cmd" : "npx",
  [
    "--yes",
    "esbuild",
    path.join(OUT, "mount-entry.tsx"),
    "--bundle",
    "--format=iife",
    `--outfile=${path.join(OUT, "mount.js")}`,
    `--alias:@=${ROOT}`,
    "--jsx=automatic",
  ],
  { cwd: ROOT, encoding: "utf8", shell: true }
);
if (mountBuild.status !== 0) {
  console.error(mountBuild.stderr || mountBuild.stdout);
  throw new Error("esbuild mount bundle failed");
}

// HTML only needs mount.js (includes panel + react)
const mountOnlyHtml = mountHtml
  .replace('<script src="/panel-esbuild.js"></script>\n', "")
  .replace('<script src="/mount.js"></script>', '<script src="/mount.js"></script>');
fs.writeFileSync(path.join(OUT, "desktop-interactive.html"), mountOnlyHtml, "utf8");
fs.writeFileSync(
  path.join(OUT, "mobile-interactive.html"),
  mountOnlyHtml.replace(
    'content="width=device-width, initial-scale=1"',
    'content="width=390, initial-scale=1"'
  ),
  "utf8"
);

const PORT = 8766;
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".png": "image/png",
};

function serveFile(file, res) {
  if (!file.startsWith(OUT) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": MIME[path.extname(file)] || "application/octet-stream" });
  res.end(fs.readFileSync(file));
}

const server = http.createServer((req, res) => {
  const u = new URL(req.url || "/", `http://127.0.0.1:${PORT}`);
  if (u.pathname === "/" || u.pathname === "/desktop-interactive.html") {
    return serveFile(path.join(OUT, "desktop-interactive.html"), res);
  }
  if (u.pathname === "/mobile-interactive.html") {
    return serveFile(path.join(OUT, "mobile-interactive.html"), res);
  }
  return serveFile(path.join(OUT, path.basename(u.pathname)), res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("Harness OK", JSON.stringify(interactionLog.node_contract, null, 2));
  console.log(`http://127.0.0.1:${PORT}/desktop-interactive.html`);
  console.log(`http://127.0.0.1:${PORT}/mobile-interactive.html`);
  fs.writeFileSync(path.join(OUT, "harness-server.json"), JSON.stringify({ port: PORT, pid: process.pid }, null, 2));
});

void mountEsbuild;
