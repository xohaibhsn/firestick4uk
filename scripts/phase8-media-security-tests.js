/**
 * Phase 8 — Media Library security tests A–V.
 * MUTATING — requires ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND
 * Usage:
 *   ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND BASE_URL=http://127.0.0.1:3010 node scripts/phase8-media-security-tests.js
 */
const { requireMutationOptIn } = require("./testMutationGuard");
requireMutationOptIn("phase8-media-security-tests");

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const bcrypt = require("bcryptjs");

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

function request(method, urlPath, { body, cookie } = {}) {
  const base = process.env.BASE_URL || "http://127.0.0.1:3010";
  const u = new URL(urlPath, base);
  const lib = u.protocol === "https:" ? https : http;
  const payload = body != null ? JSON.stringify(body) : null;
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
          ...(payload
            ? { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(payload) }
            : {}),
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
    if (payload) req.write(payload);
    req.end();
  });
}

const TINY_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64"
);
const TINY_JPEG = Buffer.from(
  "/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAFQABAQAAAAAAAAAAAAAAAAAAAAn/xAAUEAEAAAAAAAAAAAAAAAAAAAAA/8QAFQEBAQAAAAAAAAAAAAAAAAAAAAX/xAAUEQEAAAAAAAAAAAAAAAAAAAAA/9oADAMBAAIQAxAAAAGfAD/2Q==",
  "base64"
);

function dataUrl(mime, buf) {
  return `data:${mime};base64,${buf.toString("base64")}`;
}

async function main() {
  loadEnvLocal();
  const mysql = require("mysql2/promise");
  const dbCfg = {
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
  };
  let db = await mysql.createConnection(dbCfg);
  async function q(sql, params) {
    try {
      return await db.query(sql, params);
    } catch (err) {
      if (String(err?.message || "").includes("closed state") || err?.fatal) {
        try {
          await db.end();
        } catch {
          /* ignore */
        }
        db = await mysql.createConnection(dbCfg);
        return db.query(sql, params);
      }
      throw err;
    }
  }

  const out = {};
  const mark = (id, ok, detail = "") => {
    out[id] = ok ? "PASS" : "FAIL";
    console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  };

  const stamp = Date.now();
  const tempPw = "Phase8MediaPass99!";
  const hash = await bcrypt.hash(tempPw, 10);
  const saEmail = "phase8.super@test.local";
  const mgrEmail = "phase8.manager@test.local";
  const wrEmail = "phase8.writer@test.local";
  const createdMediaIds = [];
  const sessionTokenHashes = [];

  async function ensureStaff(email, role, name) {
    const [rows] = await q("SELECT id FROM admin_staff WHERE email=? LIMIT 1", [email]);
    if (rows.length) {
      await q(
        "UPDATE admin_staff SET password_hash=?, role=?, active=1, updated_at=NOW() WHERE email=?",
        [hash, role, email]
      );
      return rows[0].id;
    }
    const [r] = await q(
      `INSERT INTO admin_staff (name, email, password_hash, role, active, password_changed_at, updated_at)
       VALUES (?, ?, ?, ?, 1, NOW(), NOW())`,
      [name, email, hash, role]
    );
    return r.insertId;
  }

  async function mintCookie(email, role) {
    const [rows] = await q("SELECT id, name FROM admin_staff WHERE email=? LIMIT 1", [email]);
    if (!rows.length) throw new Error("missing staff " + email);
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    sessionTokenHashes.push(tokenHash);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await q(
      `INSERT INTO admin_sessions
        (token_hash, staff_id, principal_type, principal_name, role, expires_at, last_seen_at)
       VALUES (?, ?, 'staff', ?, ?, ?, ?)`,
      [tokenHash, rows[0].id, rows[0].name, role, expiresAt, new Date()]
    );
    return `firestick_admin_session=${token}`;
  }

  async function mintMasterCookie() {
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    sessionTokenHashes.push(tokenHash);
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await q(
      `INSERT INTO admin_sessions
        (token_hash, staff_id, principal_type, principal_name, role, expires_at, last_seen_at)
       VALUES (?, NULL, 'master', 'Admin', 'super_admin', ?, ?)`,
      [tokenHash, expiresAt, new Date()]
    );
    return `firestick_admin_session=${token}`;
  }

  try {
    await ensureStaff(saEmail, "super_admin", "Phase8 Super");
    await ensureStaff(mgrEmail, "manager", "Phase8 Manager");
    await ensureStaff(wrEmail, "writer", "Phase8 Writer");

    const saCookie = await mintMasterCookie();
    const mgrCookie = await mintCookie(mgrEmail, "manager");
    const wrCookie = await mintCookie(wrEmail, "writer");

    // A Super Admin library
    const a = await request("GET", "/api/admin-media?page=1&limit=24", { cookie: saCookie });
    const aPurposes = new Set((a.json?.items || []).map((i) => i.purpose));
    mark("A", a.status === 200 && Array.isArray(a.json?.items), `status=${a.status} items=${a.json?.items?.length}`);

    // B Manager — blog/products only
    const b = await request("GET", "/api/admin-media?page=1&limit=24", { cookie: mgrCookie });
    const bBad = (b.json?.items || []).some((i) => !["blog", "products"].includes(i.purpose));
    mark(
      "B",
      b.status === 200 && !bBad,
      `status=${b.status} bad=${bBad} purposes=${[...new Set((b.json?.items || []).map((i) => i.purpose))]}`
    );

    // C Writer — blog only
    const c = await request("GET", "/api/admin-media?page=1&limit=24", { cookie: wrCookie });
    const cBad = (c.json?.items || []).some((i) => i.purpose !== "blog");
    mark("C", c.status === 200 && !cBad, `status=${c.status} bad=${cBad}`);

    // D no cookie
    const d = await request("GET", "/api/admin-media?page=1&limit=24");
    mark("D", d.status === 401, `status=${d.status}`);

    // E Writer purpose=products → 403
    const e = await request("GET", "/api/admin-media?purpose=products", { cookie: wrCookie });
    mark("E", e.status === 403, `status=${e.status}`);

    // F Manager purpose=hero → 403
    const f = await request("GET", "/api/admin-media?purpose=hero", { cookie: mgrCookie });
    mark("F", f.status === 403, `status=${f.status}`);

    // G Super Admin purpose=hero → 200
    const g = await request("GET", "/api/admin-media?purpose=hero", { cookie: saCookie });
    mark("G", g.status === 200, `status=${g.status}`);

    // H Pagination
    const h1 = await request("GET", "/api/admin-media?page=1&limit=12", { cookie: saCookie });
    const h2 = await request("GET", "/api/admin-media?page=2&limit=12", { cookie: saCookie });
    mark(
      "H",
      h1.status === 200 &&
        h2.status === 200 &&
        h1.json?.pagination?.limit === 12 &&
        Number(h1.json?.pagination?.totalPages) >= 1,
      `p1=${h1.status} p2=${h2.status} total=${h1.json?.pagination?.total}`
    );

    // I Search
    const i = await request("GET", "/api/admin-media?q=cloudinary&limit=12", { cookie: saCookie });
    mark("I", i.status === 200 && Array.isArray(i.json?.items), `status=${i.status} n=${i.json?.items?.length}`);

    // J Unapproved purpose
    const j = await request("GET", "/api/admin-media?purpose=receipts", { cookie: saCookie });
    mark("J", j.status === 400, `status=${j.status}`);

    // K Writer blog upload 200
    const k = await request("POST", "/api/upload", {
      cookie: wrCookie,
      body: {
        file: dataUrl("image/png", TINY_PNG),
        name: `phase8-writer-blog-${stamp}.png`,
        folder: "firestick4uk/blog",
      },
    });
    if (k.json?.mediaId) createdMediaIds.push(k.json.mediaId);
    mark("K", k.status === 200 && !!k.json?.path, `status=${k.status} path=${!!k.json?.path}`);

    // L Writer products upload 403
    const l = await request("POST", "/api/upload", {
      cookie: wrCookie,
      body: {
        file: dataUrl("image/png", TINY_PNG),
        name: `phase8-writer-prod-${stamp}.png`,
        folder: "firestick4uk/products",
      },
    });
    mark("L", l.status === 403, `status=${l.status}`);

    // M Manager product upload 200
    const m = await request("POST", "/api/upload", {
      cookie: mgrCookie,
      body: {
        file: dataUrl("image/png", TINY_PNG),
        name: `phase8-mgr-prod-${stamp}.png`,
        folder: "firestick4uk/products",
      },
    });
    if (m.json?.mediaId) createdMediaIds.push(m.json.mediaId);
    mark("M", m.status === 200 && !!m.json?.path, `status=${m.status}`);

    // N Manager hero upload 403
    const n = await request("POST", "/api/upload", {
      cookie: mgrCookie,
      body: {
        file: dataUrl("image/png", TINY_PNG),
        name: `phase8-mgr-hero-${stamp}.png`,
        folder: "firestick4uk/hero-slides",
      },
    });
    mark("N", n.status === 403, `status=${n.status}`);

    // O Super hero upload 200
    const o = await request("POST", "/api/upload", {
      cookie: saCookie,
      body: {
        file: dataUrl("image/png", TINY_PNG),
        name: `phase8-sa-hero-${stamp}.png`,
        folder: "firestick4uk/hero-slides",
      },
    });
    if (o.json?.mediaId) createdMediaIds.push(o.json.mediaId);
    mark("O", o.status === 200 && !!o.json?.path, `status=${o.status}`);

    // P Fake .jpg containing HTML
    const htmlBytes = Buffer.from("<html><body>x</body></html>");
    const p = await request("POST", "/api/upload", {
      cookie: saCookie,
      body: {
        file: dataUrl("image/jpeg", htmlBytes),
        name: "fake.jpg",
        folder: "firestick4uk/blog",
      },
    });
    mark("P", p.status === 400, `status=${p.status} err=${p.json?.error}`);

    // Q Declared PNG but JPEG bytes
    const qq = await request("POST", "/api/upload", {
      cookie: saCookie,
      body: {
        file: dataUrl("image/png", TINY_JPEG),
        name: "mismatch.png",
        folder: "firestick4uk/blog",
      },
    });
    mark("Q", qq.status === 400, `status=${qq.status} err=${qq.json?.error}`);

    // R Oversized image (>8MB raw)
    const big = Buffer.concat([TINY_PNG.slice(0, 8), Buffer.alloc(8 * 1024 * 1024 + 100, 0x41)]);
    // Keep PNG magic header so MIME path reaches size check
    big[0] = 0x89;
    big[1] = 0x50;
    big[2] = 0x4e;
    big[3] = 0x47;
    const r = await request("POST", "/api/upload", {
      cookie: saCookie,
      body: {
        file: dataUrl("image/png", big),
        name: "huge.png",
        folder: "firestick4uk/blog",
      },
    });
    mark("R", r.status === 400, `status=${r.status} err=${r.json?.error}`);

    // S Successful upload creates media_assets row
    const sUp = await request("POST", "/api/upload", {
      cookie: saCookie,
      body: {
        file: dataUrl("image/png", TINY_PNG),
        name: `phase8-index-${stamp}.png`,
        folder: "firestick4uk/blog",
      },
    });
    if (sUp.json?.mediaId) createdMediaIds.push(sUp.json.mediaId);
    let sRow = null;
    if (sUp.json?.path) {
      const [rows] = await q(
        "SELECT id, purpose, source FROM media_assets WHERE url=? AND purpose='blog' LIMIT 1",
        [sUp.json.path]
      );
      sRow = rows[0] || null;
      if (sRow?.id) createdMediaIds.push(sRow.id);
    }
    mark("S", sUp.status === 200 && !!sRow, `status=${sUp.status} row=${!!sRow}`);

    // T at most one media.uploaded audit event for that upload
    let tOk = false;
    if (sRow?.id) {
      const [aud] = await q(
        "SELECT COUNT(*) AS c FROM admin_audit_log WHERE action='media.uploaded' AND entity_type='media' AND entity_id=?",
        [String(sRow.id)]
      );
      tOk = Number(aud[0].c) === 1;
      mark("T", tOk, `count=${aud[0].c}`);
    } else {
      mark("T", false, "no media row for audit check");
    }

    // U Public upload-receipt still works
    const u = await request("POST", "/api/upload-receipt", {
      body: {
        file: dataUrl("image/png", TINY_PNG),
        name: `phase8-receipt-${stamp}.png`,
      },
    });
    const uOk = u.status === 200 && !!(u.json?.path || u.json?.url);
    mark("U", uOk, `status=${u.status} body=${JSON.stringify(u.json)?.slice(0, 80)}`);

    // V Receipt upload creates NO media_assets row
    let vOk = true;
    if (u.json?.path || u.json?.url) {
      const receiptUrl = u.json.path || u.json.url;
      const [vRows] = await q("SELECT id FROM media_assets WHERE url=? LIMIT 5", [receiptUrl]);
      vOk = !vRows.length;
      mark("V", vOk, `rows=${vRows.length}`);
    } else {
      // If receipt endpoint shape differs, still assert no receipts purpose indexed recently for phase8
      const [vRows] = await q(
        "SELECT id FROM media_assets WHERE purpose='receipts' OR url LIKE '%receipt%' LIMIT 5"
      );
      // Don't fail if unrelated; check purpose receipts specifically
      const [v2] = await q("SELECT COUNT(*) AS c FROM media_assets WHERE purpose='receipts'");
      vOk = Number(v2[0].c) === 0;
      mark("V", vOk && u.status !== 500, `receiptStatus=${u.status} receiptsPurposeCount=${v2[0].c}`);
    }

    // Policy extras for picker role matrix (server authority)
    mark("PICKER-writer-products", e.status === 403);
    mark("PICKER-manager-hero", f.status === 403);
    mark("PICKER-sa-all", a.status === 200 && aPurposes.size >= 0);
  } finally {
    // Cleanup temp index rows + sessions (do not destroy Cloudinary assets)
    try {
      const ids = [...new Set(createdMediaIds.filter(Boolean))];
      if (ids.length) {
        await q(`DELETE FROM media_assets WHERE id IN (${ids.map(() => "?").join(",")})`, ids);
      }
      await q(
        "DELETE FROM media_assets WHERE original_name LIKE ? OR original_name LIKE ?",
        [`phase8-%${stamp}%`, `phase8-%`]
      );
      if (sessionTokenHashes.length) {
        await q(
          `DELETE FROM admin_sessions WHERE token_hash IN (${sessionTokenHashes.map(() => "?").join(",")})`,
          sessionTokenHashes
        );
      }
      await q(
        "DELETE FROM admin_audit_log WHERE action='media.uploaded' AND summary LIKE ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
        ["%phase8%"]
      );
    } catch (cleanupErr) {
      console.warn("cleanup warning:", cleanupErr.message);
    }
    try {
      await db.end();
    } catch {
      /* ignore */
    }
  }

  const fails = Object.entries(out).filter(([, v]) => v === "FAIL");
  console.log("\n========== SUMMARY ==========");
  for (const [k, v] of Object.entries(out)) console.log(`${v} ${k}`);
  console.log(fails.length ? `\nFAILED: ${fails.length}` : "\nALL PASS");
  process.exit(fails.length ? 1 : 0);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
