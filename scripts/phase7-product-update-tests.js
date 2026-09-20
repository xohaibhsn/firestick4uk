/**
 * Phase 7 — product partial-update safety tests (TEMP product only).
 * Requires: ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND
 * Usage:
 *   ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND BASE_URL=http://127.0.0.1:3010 node scripts/phase7-product-update-tests.js
 *
 * Against production Hostinger (careful):
 *   ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND BASE_URL=https://firestick4uk.com node scripts/phase7-product-update-tests.js
 */
const { requireMutationOptIn } = require("./testMutationGuard");
requireMutationOptIn("phase7-product-update-tests");

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");

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

const TRACK_FIELDS = [
  "name",
  "slug",
  "description",
  "short_description",
  "full_description",
  "image",
  "features",
  "seo_title",
  "meta_description",
  "focus_keyword",
  "og_image",
  "price",
  "category",
  "stock",
  "active",
];

function snapshot(row) {
  const out = {};
  for (const f of TRACK_FIELDS) {
    const v = row[f];
    out[f] = v == null ? null : String(v);
  }
  return out;
}

function sameExcept(before, after, allowed) {
  for (const f of TRACK_FIELDS) {
    if (allowed.includes(f)) continue;
    if (before[f] !== after[f]) return `field ${f} changed unexpectedly (${before[f]} -> ${after[f]})`;
  }
  return null;
}

async function main() {
  loadEnvLocal();
  const mysql = require("mysql2/promise");
  const db = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: Number(process.env.DB_PORT) || 3306,
  });

  const out = {};
  const mark = (id, ok, detail = "") => {
    out[id] = ok ? "PASS" : "FAIL";
    console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " — " + detail : ""}`);
  };

  let tempId = null;
  let cookie = "";

  try {
    // Mint master session for Super Admin API access
    const token = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO admin_sessions
        (token_hash, staff_id, principal_type, principal_name, role, expires_at, last_seen_at)
       VALUES (?, NULL, 'master', 'Admin', 'super_admin', ?, ?)`,
      [tokenHash, expiresAt, new Date()]
    );
    cookie = `firestick_admin_session=${token}`;

    const stamp = Date.now();
    const create = await request("POST", "/api/admin-products", {
      cookie,
      body: {
        name: `Phase7 Temp Product ${stamp}`,
        slug: `phase7-temp-product-${stamp}`,
        price: 12.5,
        category: "Subscription",
        stock: "Digital",
        description: "phase7-desc-original",
        short_description: "phase7-short-original",
        full_description: "phase7-full-original",
        image: "https://example.com/phase7-original.jpg",
        features: "feat-a\nfeat-b",
        seo_title: "Phase7 SEO Title",
        meta_description: "Phase7 meta description original",
        focus_keyword: "phase7-keyword",
        og_image: "https://example.com/phase7-og.jpg",
      },
    });
    tempId = create.json?.id || null;
    if (!tempId) {
      mark("SETUP", false, `create failed status=${create.status} ${create.text?.slice(0, 120)}`);
      throw new Error("temp product create failed");
    }
    mark("SETUP", true, `id=${tempId}`);

    const [rows0] = await db.query("SELECT * FROM products WHERE id=? LIMIT 1", [tempId]);
    let before = snapshot(rows0[0]);

    // A — price-only partial PUT
    const a = await request("PUT", "/api/admin-products", {
      cookie,
      body: { id: tempId, price: 19.99 },
    });
    const [rowsA] = await db.query("SELECT * FROM products WHERE id=? LIMIT 1", [tempId]);
    const afterA = snapshot(rowsA[0]);
    const aLeak = sameExcept(before, afterA, ["price"]);
    mark(
      "A",
      a.status === 200 && Number(afterA.price) === 19.99 && !aLeak,
      aLeak || `status=${a.status} changed=${JSON.stringify(a.json?.changed_fields)}`
    );
    before = afterA;

    // B — short_description only
    const b = await request("PUT", "/api/admin-products", {
      cookie,
      body: { id: tempId, short_description: "phase7-short-updated" },
    });
    const [rowsB] = await db.query("SELECT * FROM products WHERE id=? LIMIT 1", [tempId]);
    const afterB = snapshot(rowsB[0]);
    const bLeak = sameExcept(before, afterB, ["short_description"]);
    mark(
      "B",
      b.status === 200 && afterB.short_description === "phase7-short-updated" && !bLeak,
      bLeak || `status=${b.status}`
    );
    before = afterB;

    // C — explicit short_description ""
    const c = await request("PUT", "/api/admin-products", {
      cookie,
      body: { id: tempId, short_description: "" },
    });
    const [rowsC] = await db.query("SELECT * FROM products WHERE id=? LIMIT 1", [tempId]);
    const afterC = snapshot(rowsC[0]);
    const cLeak = sameExcept(before, afterC, ["short_description"]);
    mark(
      "C",
      c.status === 200 && (afterC.short_description === "" || afterC.short_description === null) && !cLeak,
      cLeak || `short=${JSON.stringify(afterC.short_description)}`
    );
    before = afterC;

    // D — omitted image preserves
    const d = await request("PUT", "/api/admin-products", {
      cookie,
      body: { id: tempId, name: before.name },
    });
    const [rowsD] = await db.query("SELECT * FROM products WHERE id=? LIMIT 1", [tempId]);
    const afterD = snapshot(rowsD[0]);
    mark("D", d.status === 200 && afterD.image === before.image, `image=${afterD.image}`);
    before = afterD;

    // E — explicit image ""
    const e = await request("PUT", "/api/admin-products", {
      cookie,
      body: { id: tempId, image: "" },
    });
    const [rowsE] = await db.query("SELECT * FROM products WHERE id=? LIMIT 1", [tempId]);
    const afterE = snapshot(rowsE[0]);
    const eLeak = sameExcept(before, afterE, ["image"]);
    mark(
      "E",
      e.status === 200 && (afterE.image === null || afterE.image === "") && !eLeak,
      eLeak || `image=${JSON.stringify(afterE.image)}`
    );
    before = afterE;

    // F — invalid category
    const f = await request("PUT", "/api/admin-products", {
      cookie,
      body: { id: tempId, category: "NotARealCategory" },
    });
    mark("F", f.status === 400, `status=${f.status}`);

    // G — invalid price
    const g = await request("PUT", "/api/admin-products", {
      cookie,
      body: { id: tempId, price: "abc" },
    });
    mark("G", g.status === 400, `status=${g.status}`);

    // H — unknown product
    const h = await request("PUT", "/api/admin-products", {
      cookie,
      body: { id: 999999991, price: 1 },
    });
    mark("H", h.status === 404, `status=${h.status}`);

    // I — changed_fields only actual changes
    const i = await request("PUT", "/api/admin-products", {
      cookie,
      body: { id: tempId, price: 21.5 },
    });
    const changed = i.json?.changed_fields || [];
    mark(
      "I",
      i.status === 200 &&
        Array.isArray(changed) &&
        changed.includes("price") &&
        changed.every((f) => f === "price"),
      `changed=${JSON.stringify(changed)}`
    );

    // J — audit metadata hygiene
    const [auditRows] = await db.query(
      `SELECT metadata_json, summary FROM admin_audit_log
       WHERE action='product.updated' AND entity_id=?
       ORDER BY id DESC LIMIT 3`,
      [String(tempId)]
    );
    const blob = JSON.stringify(auditRows || []);
    const bad =
      /password_hash|"password"\s*:|session_token|phase7-desc-original|phase7-full-original/i.test(blob);
    let fieldsOnly = true;
    for (const row of auditRows || []) {
      try {
        const meta = JSON.parse(row.metadata_json || "{}");
        if (meta.changed_fields && !Array.isArray(meta.changed_fields)) fieldsOnly = false;
      } catch {
        fieldsOnly = false;
      }
    }
    mark("J", !bad && fieldsOnly, `badSecrets=${bad}`);

    // Restore a known value for cleanup visibility
    await request("PUT", "/api/admin-products", {
      cookie,
      body: { id: tempId, short_description: "cleanup" },
    });
  } finally {
    try {
      if (tempId) {
        await request("DELETE", `/api/admin-products?id=${tempId}`, { cookie }).catch(() => {});
        await db.query("DELETE FROM products WHERE id=?", [tempId]).catch(() => {});
        await db
          .query("DELETE FROM admin_audit_log WHERE entity_type='product' AND entity_id=?", [
            String(tempId),
          ])
          .catch(() => {});
      }
      await db
        .query(
          "DELETE FROM products WHERE name LIKE 'Phase7 Temp Product%' OR slug LIKE 'phase7-temp-product-%'"
        )
        .catch(() => {});
      const [left] = await db.query(
        "SELECT id FROM products WHERE id=? OR slug LIKE 'phase7-temp-product-%' LIMIT 1",
        [tempId || 0]
      );
      mark("K", !left.length, left.length ? `leftover id=${left[0].id}` : "cleaned");
    } catch (err) {
      mark("K", false, err?.message || String(err));
    }
    try {
      await db.end();
    } catch {
      /* ignore */
    }
  }

  console.log("\nSUMMARY", out);
  const failed = Object.values(out).some((v) => v === "FAIL");
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
