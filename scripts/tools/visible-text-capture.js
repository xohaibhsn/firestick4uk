/**
 * Anonymous visible-text capture (fresh context, cart fixture).
 * playwright-core is NOT a repo dependency — resolve via PLAYWRIGHT_CORE_PATH
 * or artifacts-level _tools/node_modules/playwright-core.
 *
 * Usage: node scripts/tools/visible-text-capture.js --label <before|after|...> --out <dir>
 * Exit 2: playwright-core missing; Exit 3: refuse overwrite of existing file.
 */
"use strict";

const fs = require("fs");
const path = require("path");
const {
  normalizeVisibleText,
  NORMALIZE_VISIBLE_TEXT_SOURCE,
} = require("./visible-text-normalize");
const { readUntilStable } = require("./visible-text-stable");

const BASE = "https://firestick4uk.com";
const CART = JSON.stringify([
  { id: 4, name: "Firestick 4K", price: 49.99, qty: 1 },
]);
const PAGES_FILE = path.join(__dirname, "visible-text-pages.json");

function parseArgs(argv) {
  const out = { label: null, outDir: null };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--label") out.label = argv[++i];
    else if (a === "--out") out.outDir = argv[++i];
    else if (a === "--help" || a === "-h") out.help = true;
  }
  return out;
}

function resolvePlaywrightCore(outDir) {
  if (process.env.PLAYWRIGHT_CORE_PATH) {
    const p = path.resolve(process.env.PLAYWRIGHT_CORE_PATH);
    if (fs.existsSync(p)) return p;
  }
  const candidates = [];
  const absOut = path.resolve(outDir);
  // Artifacts-level _tools next to --out, and parents
  let cur = absOut;
  for (let i = 0; i < 6; i++) {
    candidates.push(
      path.join(cur, "_tools", "node_modules", "playwright-core")
    );
    candidates.push(
      path.join(path.dirname(cur), "_tools", "node_modules", "playwright-core")
    );
    const parent = path.dirname(cur);
    if (parent === cur) break;
    cur = parent;
  }
  // Prior MULTI artifacts under sibling _reports
  const reportsRoot = path.resolve(absOut, "..");
  if (fs.existsSync(reportsRoot)) {
    try {
      for (const name of fs.readdirSync(reportsRoot)) {
        if (!/^multi-/i.test(name)) continue;
        candidates.push(
          path.join(
            reportsRoot,
            name,
            "_tools",
            "node_modules",
            "playwright-core"
          )
        );
      }
    } catch {
      /* ignore */
    }
  }
  for (const c of candidates) {
    if (fs.existsSync(c)) return c;
  }
  return null;
}

function findChrome() {
  const root = path.join(
    process.env.USERPROFILE || "",
    "AppData",
    "Local",
    "ms-playwright"
  );
  const candidates = [];
  if (fs.existsSync(root)) {
    for (const d of fs.readdirSync(root)) {
      const base = path.join(root, d);
      const walk = (dir, depth) => {
        if (depth > 4 || !fs.existsSync(dir)) return;
        for (const name of fs.readdirSync(dir)) {
          const p = path.join(dir, name);
          let st;
          try {
            st = fs.statSync(p);
          } catch {
            continue;
          }
          if (st.isFile() && name.toLowerCase() === "chrome.exe") {
            candidates.push(p);
          } else if (st.isDirectory()) walk(p, depth + 1);
        }
      };
      walk(base, 0);
    }
  }
  candidates.sort();
  return candidates[candidates.length - 1] || null;
}

function utcStamp(d = new Date()) {
  return d
    .toISOString()
    .replace(/[:.]/g, "-")
    .replace(/Z$/, "Z");
}

async function capturePage(context, pageSpec, attempt, normSource) {
  const page = await context.newPage();
  try {
    await page.addInitScript((cartJson) => {
      try {
        localStorage.setItem("firestick_cart", cartJson);
      } catch {
        /* ignore */
      }
    }, CART);
    const url = BASE + pageSpec.path;
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 90000 });
    await page
      .waitForFunction(
        () =>
          !!(
            document.body &&
            (document.body.innerText || "").trim().length > 200
          ),
        { timeout: 30000 }
      )
      .catch(() => {});
    // networkidle best-effort (timeout 20000 ms, catch ignored)
    await page
      .waitForLoadState("networkidle", { timeout: 20000 })
      .catch(() => {});
    await page.evaluate(() => document.fonts.ready).catch(() => {});

    const readOnce = () =>
      page.evaluate(async (normSrc) => {
        // Inject shared normaliser source (must match scripts/tools/visible-text-normalize.js)
        // eslint-disable-next-line no-new-func
        const norm = new Function("return (" + normSrc + ")")();
        const mc = document.querySelector(
          '[aria-label="Cart summary"], header'
        );
        const marker = mc
          ? "[[MC]]" + (mc.innerText || "") + "[[/MC]]\n"
          : "";
        const vt = marker + ((document.body && document.body.innerText) || "");
        const n = norm(vt);
        const buf = await crypto.subtle.digest(
          "SHA-256",
          new TextEncoder().encode(n)
        );
        const hash = Array.from(new Uint8Array(buf))
          .map((b) => b.toString(16).padStart(2, "0"))
          .join("");
        return {
          path: location.pathname,
          hash,
          len: n.length,
          rawLen: vt.length,
          preview: n.slice(0, 120),
          text: n,
        };
      }, normSource);

    const stab = await readUntilStable(readOnce, {
      maxReads: 6,
      intervalMs: 1500,
    });
    const result = stab.final;

    if (!result || result.len < 150) {
      return {
        key: pageSpec.key,
        path: pageSpec.path,
        ok: false,
        attempt,
        error: `too_short len=${result && result.len} preview=${result && result.preview}`,
      };
    }
    const text = String(result.text || "");
    const lineArr = text.split(/\n/);
    return {
      key: pageSpec.key,
      path: pageSpec.path,
      hash: result.hash,
      len: result.len,
      rawLen: result.rawLen,
      attempt,
      ok: true,
      stable: stab.stable,
      reads: stab.reads,
      distinctHashes: stab.distinctHashes,
      lines: lineArr.length,
      text,
    };
  } catch (err) {
    return {
      key: pageSpec.key,
      path: pageSpec.path,
      ok: false,
      attempt,
      error: String(err && err.message ? err.message : err),
    };
  } finally {
    await page.close().catch(() => {});
  }
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.label || !args.outDir) {
    console.error(
      "Usage: node scripts/tools/visible-text-capture.js --label <before|after|...> --out <dir>"
    );
    process.exit(1);
  }

  const outDir = path.resolve(args.outDir);
  fs.mkdirSync(outDir, { recursive: true });

  const stamp = utcStamp();
  const outFile = path.join(
    outDir,
    `visible-text-${args.label}-${stamp}.json`
  );
  const textsDir = outFile.replace(/\.json$/i, ".texts");
  if (fs.existsSync(outFile)) {
    console.error("REFUSE overwrite existing file:", outFile);
    process.exit(3);
  }
  if (fs.existsSync(textsDir)) {
    console.error("REFUSE overwrite existing file:", textsDir);
    process.exit(3);
  }

  const pwPath = resolvePlaywrightCore(outDir);
  if (!pwPath) {
    console.error(
      "playwright-core not found. Set PLAYWRIGHT_CORE_PATH to the playwright-core package root, or place it at <artifacts>/_tools/node_modules/playwright-core (as used by prior MULTI captures)."
    );
    process.exit(2);
  }

  const pages = JSON.parse(fs.readFileSync(PAGES_FILE, "utf8"));
  if (!Array.isArray(pages) || pages.length !== 12) {
    console.error("visible-text-pages.json must list exactly 12 pages");
    process.exit(1);
  }

  // Prove Node normaliser loads (injection uses the same source string)
  void normalizeVisibleText;
  const normSource = NORMALIZE_VISIBLE_TEXT_SOURCE;

  const { chromium } = require(pwPath);
  const chrome = findChrome();
  if (!chrome) {
    console.error("No Chromium found under ms-playwright");
    process.exit(1);
  }
  console.log("chrome", chrome);
  console.log("playwright-core", pwPath);

  const browser = await chromium.launch({
    executablePath: chrome,
    headless: true,
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
  });

  const captured = [];
  for (const spec of pages) {
    let last = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      last = await capturePage(context, spec, attempt, normSource);
      if (last.ok) break;
      console.error("retry", spec.path, attempt, last.error);
      await new Promise((r) => setTimeout(r, 1500));
    }
    if (!last || !last.ok) {
      console.error("FAILED page", spec.path, last && last.error);
      await browser.close();
      // Never write a partial capture file
      process.exit(1);
    }
    captured.push(last);
    console.log(
      "ok",
      last.path,
      last.hash.slice(0, 12),
      "len",
      last.len,
      "stable=" + last.stable,
      "reads=" + last.reads
    );
  }

  // Second existence check (race / identical stamp)
  if (fs.existsSync(outFile) || fs.existsSync(textsDir)) {
    console.error(
      "REFUSE overwrite existing file:",
      fs.existsSync(outFile) ? outFile : textsDir
    );
    await browser.close();
    process.exit(3);
  }

  fs.mkdirSync(textsDir, { recursive: true });
  const pagesOut = [];
  for (const p of captured) {
    const textFileName = p.key + ".txt";
    const textAbs = path.join(textsDir, textFileName);
    const body = String(p.text || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
    fs.writeFileSync(textAbs, body.endsWith("\n") ? body : body + "\n", "utf8");
    const { text: _drop, ...rest } = p;
    pagesOut.push({
      ...rest,
      textFile: path.join(path.basename(textsDir), textFileName).replace(/\\/g, "/"),
    });
  }

  const payload = {
    label: args.label,
    capturedAt: new Date().toISOString(),
    base: BASE,
    pageCount: pagesOut.length,
    textsDir: path.basename(textsDir),
    pages: pagesOut,
  };

  fs.writeFileSync(outFile, JSON.stringify(payload, null, 2) + "\n", "utf8");
  console.log("wrote", outFile);
  console.log("texts", textsDir);
  await browser.close();
}

if (require.main === module) {
  main().catch((e) => {
    console.error(e);
    process.exit(1);
  });
}
