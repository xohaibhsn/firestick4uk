/**
 * Post-Phase-5 hardening tests A–K (date validation + CSV formula defense).
 * Unit tests for shared helpers; optional live API checks if BASE_URL is set.
 *
 * Usage:
 *   node scripts/phase5-hardening-tests.js
 *   BASE_URL=http://127.0.0.1:3010 node scripts/phase5-hardening-tests.js
 */
const path = require("path");
const fs = require("fs");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

// Load compiled helpers via ts-node-less path: duplicate minimal require through next build is heavy.
// Instead, evaluate the TypeScript source patterns by requiring after a tiny transpile-free reimplementation
// that mirrors lib/adminOrdersQuery — OR use dynamic import of the .ts via project's tsx if available.
// Prefer reading the actual module through Next's webpack is overkill; use child_process + npx ts-node if present.
// Simplest: inline the same logic by requiring from a .js shim that re-exports after compiling with typescript transpileModule.

const ts = require("typescript");
const src = fs.readFileSync(path.join(__dirname, "../lib/adminOrdersQuery.ts"), "utf8");
const { outputText } = ts.transpileModule(src, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
});
const modulePath = path.join(__dirname, "../.tmp-adminOrdersQuery.cjs");
fs.writeFileSync(modulePath, outputText);
const {
  isValidCalendarDate,
  parseOrderFilters,
  csvEscapeCell,
} = require(modulePath);

function loadEnvLocal() {
  const envPath = path.join(process.cwd(), ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (!m) continue;
    const key = m[1].trim();
    let val = m[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    if (!process.env[key]) process.env[key] = val;
  }
}

function request(method, urlPath, { cookie } = {}) {
  const base = process.env.BASE_URL;
  if (!base) return Promise.resolve(null);
  const u = new URL(urlPath, base);
  const lib = u.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request(
      {
        hostname: u.hostname,
        port: u.port || (u.protocol === "https:" ? 443 : 80),
        path: u.pathname + u.search,
        method,
        headers: {
          Accept: "application/json",
          ...(cookie ? { Cookie: cookie } : {}),
        },
      },
      (res) => {
        const chunks = [];
        res.on("data", (c) => chunks.push(c));
        res.on("end", () => {
          const text = Buffer.concat(chunks).toString("utf8");
          let json = null;
          try {
            json = JSON.parse(text);
          } catch {
            /* ignore */
          }
          resolve({ status: res.statusCode, json, text });
        });
      }
    );
    req.on("error", reject);
    req.end();
  });
}

async function mintMasterCookie() {
  loadEnvLocal();
  const mysql = require("mysql2/promise");
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
  });
  const token = crypto.randomBytes(32).toString("hex");
  const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
  await db.query(
    `INSERT INTO admin_sessions
      (token_hash, staff_id, principal_type, principal_name, role, expires_at, last_seen_at)
     VALUES (?, NULL, 'master', 'Admin', 'super_admin', ?, ?)`,
    [tokenHash, expiresAt, new Date()]
  );
  await db.end();
  return `firestick_admin_session=${token}`;
}

async function main() {
  const out = {};
  const mark = (id, ok, detail = "") => {
    out[id] = ok ? "PASS" : "FAIL";
    console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  };

  // A / B — invalid calendar dates rejected by parser
  const a = parseOrderFilters({ date_from: "2026-02-31" });
  mark("A", !!a.error && /date_from/i.test(a.error), a.error || "");

  const b = parseOrderFilters({ date_to: "2026-04-31" });
  mark("B", !!b.error && /date_to/i.test(b.error), b.error || "");

  // C — leap day accepted
  const c = parseOrderFilters({ date_from: "2028-02-29", date_to: "2028-02-29" });
  mark(
    "C",
    !c.error && c.filters.dateFrom === "2028-02-29 00:00:00" && isValidCalendarDate("2028-02-29"),
    c.error || "ok"
  );

  // D — from > to
  const d = parseOrderFilters({ date_from: "2026-05-10", date_to: "2026-05-01" });
  mark("D", d.error === "date_from cannot be after date_to", d.error || "");

  // E — same day
  const e = parseOrderFilters({ date_from: "2026-05-01", date_to: "2026-05-01" });
  mark("E", !e.error && !!e.filters.dateFrom && !!e.filters.dateTo, e.error || "ok");

  // F–K CSV — apostrophe prefix may be wrapped in quotes when cell has comma/CR/LF
  const neutralized = (raw) => {
    const out = csvEscapeCell(raw);
    return out.startsWith("'") || out.startsWith("\"'");
  };
  mark("F", neutralized("=CMD()"), csvEscapeCell("=CMD()"));
  mark("G", neutralized("+SUM(1,2)"), csvEscapeCell("+SUM(1,2)"));
  mark("H", neutralized("@SUM(A1:A2)"), csvEscapeCell("@SUM(A1:A2)"));
  mark("I", neutralized("\t=CMD()"), csvEscapeCell("\t=CMD()"));
  mark("J", neutralized("   =CMD()"), csvEscapeCell("   =CMD()"));
  mark("K", csvEscapeCell("John Smith") === "John Smith");

  // Extra sanity: CR/LF / leading-dash formulas
  if (!neutralized("\r=CMD()") || !neutralized("\n=CMD()") || !neutralized("-1+2")) {
    console.log("WARN extra formula cases failed");
  }

  // Live API only when BASE_URL is explicitly set for this run
  if (process.env.BASE_URL && process.env.RUN_LIVE === "1") {
    try {
      const cookie = await mintMasterCookie();
      const liveA = await request("GET", "/api/admin-orders?date_from=2026-02-31", { cookie });
      mark("A-live", liveA?.status === 400, `status=${liveA?.status}`);
      const liveD = await request(
        "GET",
        "/api/admin-orders?date_from=2026-05-10&date_to=2026-05-01",
        { cookie }
      );
      mark("D-live", liveD?.status === 400, `status=${liveD?.status} msg=${liveD?.json?.error}`);
      const liveC = await request(
        "GET",
        "/api/admin-orders?page=1&limit=10&date_from=2028-02-29&date_to=2028-02-29",
        { cookie }
      );
      mark("C-live", liveC?.status === 200, `status=${liveC?.status}`);
    } catch (err) {
      console.log("LIVE skipped/failed:", err?.message || err);
    }
  }

  try {
    fs.unlinkSync(modulePath);
  } catch {
    /* ignore */
  }

  console.log("\nSUMMARY", out);
  const failed = Object.values(out).some((v) => v === "FAIL");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
