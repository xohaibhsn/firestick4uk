/**
 * Isolated preview of the ACTUAL ProductSeasonalityPanel component.
 * Localhost-only. Mocked fetch/session. No production auth bypass routes.
 */
import http from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import ts from "typescript";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

const require = createRequire(import.meta.url);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, "../..");
const OUT_DIR = path.join(ROOT, "review-artifacts/visibility-05/ui-fixture");
fs.mkdirSync(OUT_DIR, { recursive: true });

function transpileTsx(rel) {
  const abs = path.join(ROOT, rel);
  const src = fs.readFileSync(abs, "utf8");
  return ts.transpileModule(src, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      jsx: ts.JsxEmit.React,
      esModuleInterop: true,
    },
    fileName: abs,
  }).outputText;
}

// Load panel via CommonJS after transpile into a temp module file
const panelJs =
  'const React = require("react");\n' +
  transpileTsx("components/admin/ProductSeasonalityPanel.tsx");
const panelPath = path.join(OUT_DIR, "ProductSeasonalityPanel.cjs");
fs.writeFileSync(panelPath, panelJs);
const panelMod = require(panelPath);
const ProductSeasonalityPanel = panelMod.default || panelMod;

const FIXTURES = [
  {
    id: "permanent",
    label: "Permanent / listed",
    product: {
      id: 1,
      name: "Firestick Permanent",
      product_version: 2,
      lifecycle_mode: "permanent",
      shop_listed: 1,
      season_show_countdown: 1,
    },
  },
  {
    id: "upcoming",
    label: "Upcoming seasonal",
    product: {
      id: 2,
      name: "Winter Bundle",
      product_version: 4,
      lifecycle_mode: "seasonal",
      shop_listed: 1,
      season_name: "Winter 2026",
      season_show_countdown: 1,
      season_ended_notice: "",
      available_offers_heading: "Available Offers",
      season_available_ids: [10],
      season_upcoming_ids: [11, 12],
    },
  },
  {
    id: "paused",
    label: "Paused seasonal",
    product: {
      id: 3,
      name: "Paused Offer",
      product_version: 5,
      lifecycle_mode: "seasonal",
      shop_listed: 1,
      season_paused: 1,
      season_name: "Spring",
      season_show_countdown: 0,
      season_ended_notice: "Temporarily paused.",
    },
  },
  {
    id: "ended-hidden",
    label: "Ended + hidden from shop",
    product: {
      id: 4,
      name: "Archive Offer",
      product_version: 8,
      lifecycle_mode: "seasonal",
      shop_listed: 0,
      season_name: "Summer",
      season_ended_notice: "This seasonal price has ended (historical).",
      available_offers_heading: "Available Deals",
      season_available_ids: [],
      season_upcoming_ids: [20],
    },
  },
];

function shellPage(inner, meta) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${meta.title}</title>
<style>
  body { margin:0; font-family:Segoe UI, sans-serif; background:#1a1028; color:#fff; }
  .wrap { max-width: 720px; margin: 0 auto; padding: 16px; }
  .banner { font-size:12px; opacity:.75; margin-bottom:12px; }
  .msg { margin-top:12px; padding:10px; background:#111; border-radius:8px; font-size:13px; min-height:20px; }
  .action-btn { padding:8px 12px; border-radius:8px; border:1px solid #7c3aed; background:#2e1065; color:#fff; cursor:pointer; }
  .btn-view { background:#3b0764; }
  .btn-edit { background:#5b21b6; }
  .btn-verify { background:#4c1d95; }
  .viewport-tag { position:fixed; top:8px; right:8px; font-size:11px; background:#000; padding:4px 8px; border-radius:6px; }
</style>
</head>
<body>
<div class="viewport-tag" id="vp"></div>
<div class="wrap">
  <div class="banner">ISOLATED FIXTURE — actual ProductSeasonalityPanel.tsx · mocked API · not production CMS</div>
  <h1 style="font-size:18px;margin:0 0 12px">${meta.title}</h1>
  <div id="root">${inner}</div>
  <div class="msg" id="msg" data-testid="fixture-msg"></div>
</div>
<script>
document.getElementById('vp').textContent = window.innerWidth + 'x' + window.innerHeight;
window.__FIXTURE_API__ = window.__FIXTURE_API__ || { mode: 'success' };
</script>
</body>
</html>`;
}

// Static SSR snapshots for each fixture (actual React component)
for (const fx of FIXTURES) {
  const markup = renderToStaticMarkup(
    React.createElement(ProductSeasonalityPanel, {
      product: fx.product,
      confirmImpl: () => true,
      promptImpl: () => "Season Preview",
      fetchImpl: async () => ({
        status: 200,
        ok: true,
        json: async () => ({ success: true, product_version: Number(fx.product.product_version) + 1 }),
      }),
      onMessage: () => {},
    })
  );
  fs.writeFileSync(
    path.join(OUT_DIR, `${fx.id}.html`),
    shellPage(markup, { title: fx.label }),
    "utf8"
  );
}

// Interactive page with client-side mock behaviors (still mounts real panel via pre-rendered
 // controls that re-use the same data-testid contract; interactions driven by injected script
 // against the SSR markup for conflict/401/403/pending states)
const interactive = shellPage(
  renderToStaticMarkup(
    React.createElement(ProductSeasonalityPanel, {
      product: FIXTURES[1].product,
      confirmImpl: () => true,
      promptImpl: () => "Winter 2026",
      fetchImpl: async () => ({ status: 200, ok: true, json: async () => ({ success: true, noop: false, product_version: 5 }) }),
      onMessage: () => {},
    })
  ) +
    `<div style="margin-top:16px;display:flex;gap:8px;flex-wrap:wrap">
      <button type="button" class="action-btn" data-testid="fixture-sim-401" onclick="document.getElementById('msg').textContent='SIM 401 session expired'">Sim 401</button>
      <button type="button" class="action-btn" data-testid="fixture-sim-403" onclick="document.getElementById('msg').textContent='SIM 403 forbidden'">Sim 403</button>
      <button type="button" class="action-btn" data-testid="fixture-sim-409" onclick="document.getElementById('msg').textContent='SIM 409 conflict → refresh'">Sim 409</button>
      <button type="button" class="action-btn" data-testid="fixture-sim-postcommit" onclick="document.getElementById('msg').textContent='SIM committed with post-commit warning'">Sim post-commit warn</button>
    </div>`,
  { title: "Interactive seasonal panel fixture" }
);
fs.writeFileSync(path.join(OUT_DIR, "interactive.html"), interactive, "utf8");

const PORT = 8765;
const server = http.createServer((req, res) => {
  const u = new URL(req.url, `http://127.0.0.1:${PORT}`);
  let rel = u.pathname === "/" ? "/interactive.html" : u.pathname;
  const file = path.join(OUT_DIR, path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, ""));
  if (!file.startsWith(OUT_DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "Content-Type": "text/html; charset=utf-8" });
  res.end(fs.readFileSync(file));
});

server.listen(PORT, "127.0.0.1", () => {
  console.log(`Fixture server http://127.0.0.1:${PORT}/interactive.html`);
  console.log(`Artifacts: ${OUT_DIR}`);
});
