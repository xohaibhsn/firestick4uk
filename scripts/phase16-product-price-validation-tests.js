/**
 * Phase 16 — product price validation hardening (TEMP rows only).
 * Requires: ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND
 *
 * Usage:
 *   ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND BASE_URL=http://127.0.0.1:3010 node scripts/phase16-product-price-validation-tests.js
 */
const { requireMutationOptIn } = require("./testMutationGuard");
requireMutationOptIn("phase16-product-price-validation-tests");

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

function baseProduct(stamp, price) {
  return {
    name: `Phase16 Temp Product ${stamp}`,
    slug: `phase16-temp-product-${stamp}`,
    price,
    category: "Subscription",
    stock: "Digital",
    description: "phase16",
    short_description: "phase16-short",
  };
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

  const createdIds = [];
  let cookie = "";
  let sessionTokenHash = "";

  try {
    const token = crypto.randomBytes(32).toString("hex");
    sessionTokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const expiresAt = new Date(Date.now() + 2 * 60 * 60 * 1000);
    await db.query(
      `INSERT INTO admin_sessions
        (token_hash, staff_id, principal_type, principal_name, role, expires_at, last_seen_at)
       VALUES (?, NULL, 'master', 'Admin', 'super_admin', ?, ?)`,
      [sessionTokenHash, expiresAt, new Date()]
    );
    cookie = `firestick_admin_session=${token}`;

    async function createWithPrice(price, label) {
      const stamp = `${Date.now()}-${label}`;
      const res = await request("POST", "/api/admin-products", {
        cookie,
        body: baseProduct(stamp, price),
      });
      const id = res.json?.id || null;
      if (id) createdIds.push(id);
      return { res, id, stamp };
    }

    // A — 14 accepted
    {
      const { res, id } = await createWithPrice(14, "a");
      let dbPrice = null;
      if (id) {
        const [rows] = await db.query("SELECT price FROM products WHERE id=? LIMIT 1", [id]);
        dbPrice = rows[0] ? Number(rows[0].price) : null;
      }
      mark("A", res.status === 200 && id && dbPrice === 14, `status=${res.status} price=${dbPrice}`);
    }

    // B — "14.99" accepted
    {
      const { res, id } = await createWithPrice("14.99", "b");
      let dbPrice = null;
      if (id) {
        const [rows] = await db.query("SELECT price FROM products WHERE id=? LIMIT 1", [id]);
        dbPrice = rows[0] ? Number(rows[0].price) : null;
      }
      mark("B", res.status === 200 && id && dbPrice === 14.99, `status=${res.status} price=${dbPrice}`);
    }

    // C — "£14.99" accepted
    {
      const { res, id } = await createWithPrice("£14.99", "c");
      let dbPrice = null;
      if (id) {
        const [rows] = await db.query("SELECT price FROM products WHERE id=? LIMIT 1", [id]);
        dbPrice = rows[0] ? Number(rows[0].price) : null;
      }
      mark("C", res.status === 200 && id && dbPrice === 14.99, `status=${res.status} price=${dbPrice}`);
    }

    // D — "£1,299.99" → 1299.99
    {
      const { res, id } = await createWithPrice("£1,299.99", "d");
      let dbPrice = null;
      if (id) {
        const [rows] = await db.query("SELECT price FROM products WHERE id=? LIMIT 1", [id]);
        dbPrice = rows[0] ? Number(rows[0].price) : null;
      }
      mark("D", res.status === 200 && id && dbPrice === 1299.99, `status=${res.status} price=${dbPrice}`);
    }

    // E — "12abc" rejected
    {
      const beforeCount = (
        await db.query("SELECT COUNT(*) AS c FROM products WHERE slug LIKE 'phase16-temp-product-%'")
      )[0][0].c;
      const { res, id } = await createWithPrice("12abc", "e");
      const afterCount = (
        await db.query("SELECT COUNT(*) AS c FROM products WHERE slug LIKE 'phase16-temp-product-%'")
      )[0][0].c;
      mark(
        "E",
        res.status === 400 && !id && Number(afterCount) === Number(beforeCount),
        `status=${res.status} id=${id}`
      );
    }

    // F — "abc12" rejected
    {
      const { res, id } = await createWithPrice("abc12", "f");
      mark("F", res.status === 400 && !id, `status=${res.status}`);
    }

    // G — "£12xyz" rejected
    {
      const { res, id } = await createWithPrice("£12xyz", "g");
      mark("G", res.status === 400 && !id, `status=${res.status}`);
    }

    // H — "1.2.3" rejected
    {
      const { res, id } = await createWithPrice("1.2.3", "h");
      mark("H", res.status === 400 && !id, `status=${res.status}`);
    }

    // I — "-1" rejected
    {
      const { res, id } = await createWithPrice("-1", "i");
      mark("I", res.status === 400 && !id, `status=${res.status}`);
    }

    // J — "" rejected
    {
      const { res, id } = await createWithPrice("", "j");
      mark("J", res.status === 400 && !id, `status=${res.status}`);
    }

    // K — omitted PUT price preserves existing value
    {
      const { res: createRes, id } = await createWithPrice(42.5, "k");
      if (!id) {
        mark("K", false, `setup create failed status=${createRes.status}`);
      } else {
        const put = await request("PUT", "/api/admin-products", {
          cookie,
          body: { id, short_description: "phase16-k-updated" },
        });
        const [rows] = await db.query("SELECT price, short_description FROM products WHERE id=? LIMIT 1", [
          id,
        ]);
        const row = rows[0];
        mark(
          "K",
          put.status === 200 &&
            Number(row.price) === 42.5 &&
            String(row.short_description) === "phase16-k-updated",
          `status=${put.status} price=${row?.price}`
        );
      }
    }

    // L — malformed PUT price returns 400 and does not change row
    {
      const { res: createRes, id } = await createWithPrice(55.55, "l");
      if (!id) {
        mark("L", false, `setup create failed status=${createRes.status}`);
      } else {
        const [beforeRows] = await db.query("SELECT * FROM products WHERE id=? LIMIT 1", [id]);
        const before = beforeRows[0];
        const put = await request("PUT", "/api/admin-products", {
          cookie,
          body: { id, price: "12abc" },
        });
        const [afterRows] = await db.query("SELECT * FROM products WHERE id=? LIMIT 1", [id]);
        const after = afterRows[0];
        mark(
          "L",
          put.status === 400 &&
            Number(after.price) === Number(before.price) &&
            String(after.short_description) === String(before.short_description),
          `status=${put.status} priceBefore=${before.price} priceAfter=${after.price}`
        );
      }
    }

    // M — malformed POST price creates no product
    {
      const stamp = `${Date.now()}-m`;
      const slug = `phase16-temp-product-${stamp}`;
      const res = await request("POST", "/api/admin-products", {
        cookie,
        body: baseProduct(stamp, "£12xyz"),
      });
      const [rows] = await db.query("SELECT id FROM products WHERE slug=? LIMIT 1", [slug]);
      mark(
        "M",
        res.status === 400 && (!rows || rows.length === 0) && !res.json?.id,
        `status=${res.status} rows=${rows?.length || 0}`
      );
    }
  } finally {
    try {
      for (const id of createdIds) {
        await request("DELETE", `/api/admin-products?id=${id}`, { cookie }).catch(() => {});
        await db.query("DELETE FROM products WHERE id=?", [id]).catch(() => {});
        await db
          .query("DELETE FROM admin_audit_log WHERE entity_type='product' AND entity_id=?", [String(id)])
          .catch(() => {});
        await db
          .query("DELETE FROM content_revisions WHERE entity_type='product' AND entity_id=?", [String(id)])
          .catch(() => {});
      }
      await db
        .query(
          "DELETE FROM products WHERE name LIKE 'Phase16 Temp Product%' OR slug LIKE 'phase16-temp-product-%'"
        )
        .catch(() => {});
      if (sessionTokenHash) {
        await db.query("DELETE FROM admin_sessions WHERE token_hash=?", [sessionTokenHash]).catch(() => {});
      }
    } catch {
      /* ignore cleanup errors */
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
