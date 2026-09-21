/**
 * Phase 9 — CMS content revision + restore tests A–BB.
 * MUTATING — requires ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND
 * Usage:
 *   ALLOW_DB_MUTATION_TESTS=YES_I_UNDERSTAND BASE_URL=http://127.0.0.1:3010 node scripts/phase9-revision-tests.js
 */
const { requireMutationOptIn } = require("./testMutationGuard");
requireMutationOptIn("phase9-revision-tests");

const fs = require("fs");
const path = require("path");
const http = require("http");
const https = require("https");
const crypto = require("crypto");
const { spawnSync } = require("child_process");
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
  const tempPw = "Phase9RevPass99!";
  const hash = await bcrypt.hash(tempPw, 10);
  const saEmail = "phase9.super@test.local";
  const mgrEmail = "phase9.manager@test.local";
  const wrEmail = "phase9.writer@test.local";
  const sessionTokenHashes = [];

  const productIds = [];
  const blogIds = [];
  const siteKeys = [];
  let siteTaglineOriginal = null;
  let saCookie = "";
  let mgrCookie = "";
  let wrCookie = "";

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

  async function countRevisions(entityType, entityId) {
    const [rows] = await q(
      "SELECT COUNT(*) AS c FROM content_revisions WHERE entity_type=? AND entity_id=?",
      [entityType, String(entityId)]
    );
    return Number(rows[0].c);
  }

  async function latestRevision(entityType, entityId) {
    const [rows] = await q(
      `SELECT * FROM content_revisions
       WHERE entity_type=? AND entity_id=?
       ORDER BY created_at DESC, id DESC LIMIT 1`,
      [entityType, String(entityId)]
    );
    return rows[0] || null;
  }

  try {
    await ensureStaff(saEmail, "super_admin", "Phase9 Super");
    await ensureStaff(mgrEmail, "manager", "Phase9 Manager");
    await ensureStaff(wrEmail, "writer", "Phase9 Writer");

    saCookie = await mintMasterCookie();
    mgrCookie = await mintCookie(mgrEmail, "manager");
    wrCookie = await mintCookie(wrEmail, "writer");

    // --- Setup temp product ---
    const prodName0 = `Phase9 Temp Product ${stamp}`;
    const prodSlug0 = `phase9-temp-product-${stamp}`;
    const createP = await request("POST", "/api/admin-products", {
      cookie: saCookie,
      body: {
        name: prodName0,
        slug: prodSlug0,
        price: 10,
        category: "Subscription",
        stock: "Digital",
        description: "phase9-desc-v0",
        short_description: "phase9-short-v0",
      },
    });
    const productId = createP.json?.id;
    if (!productId) throw new Error(`product create failed status=${createP.status}`);
    productIds.push(productId);

    const conflictSlug = `phase9-temp-conflict-${stamp}`;
    const createConflict = await request("POST", "/api/admin-products", {
      cookie: saCookie,
      body: {
        name: `Phase9 Conflict ${stamp}`,
        slug: conflictSlug,
        price: 11,
        category: "Device",
        stock: "Digital",
        description: "phase9-conflict",
      },
    });
    const conflictId = createConflict.json?.id;
    if (conflictId) productIds.push(conflictId);

    // A — Product update creates one revision with pre-update state
    const countBeforeA = await countRevisions("product", productId);
    const aUp = await request("PUT", "/api/admin-products", {
      cookie: saCookie,
      body: { id: productId, name: `Phase9 Temp Product Updated ${stamp}` },
    });
    const countAfterA = await countRevisions("product", productId);
    const revA = await latestRevision("product", productId);
    let snapA = null;
    try {
      snapA = JSON.parse(revA?.snapshot_json || "null");
    } catch {
      snapA = null;
    }
    mark(
      "A",
      aUp.status === 200 &&
        countAfterA === countBeforeA + 1 &&
        revA?.revision_action === "update" &&
        snapA?.name === prodName0,
      `status=${aUp.status} delta=${countAfterA - countBeforeA} snapName=${snapA?.name}`
    );

    // B — No-op product update creates no revision
    const countBeforeB = await countRevisions("product", productId);
    const bUp = await request("PUT", "/api/admin-products", {
      cookie: saCookie,
      body: { id: productId, name: `Phase9 Temp Product Updated ${stamp}` },
    });
    const countAfterB = await countRevisions("product", productId);
    mark(
      "B",
      bUp.status === 200 &&
        Array.isArray(bUp.json?.changed_fields) &&
        bUp.json.changed_fields.length === 0 &&
        countAfterB === countBeforeB,
      `status=${bUp.status} changed=${JSON.stringify(bUp.json?.changed_fields)} delta=${countAfterB - countBeforeB}`
    );

    // C — changed_fields accurate
    const cUp = await request("PUT", "/api/admin-products", {
      cookie: saCookie,
      body: { id: productId, price: 22.5 },
    });
    const revC = await latestRevision("product", productId);
    let fieldsC = [];
    try {
      fieldsC = JSON.parse(revC?.changed_fields_json || "[]");
    } catch {
      fieldsC = [];
    }
    const apiFields = cUp.json?.changed_fields || [];
    mark(
      "C",
      cUp.status === 200 &&
        apiFields.includes("price") &&
        apiFields.every((f) => f === "price") &&
        fieldsC.includes("price") &&
        fieldsC.every((f) => f === "price"),
      `api=${JSON.stringify(apiFields)} db=${JSON.stringify(fieldsC)}`
    );

    // Capture revision to restore (pre-price / has name Updated + old price in snapshot of C is previous state)
    // For D: restore to name from revA snapshot (original name)
    const revForRestore = revA;
    const nameBeforeRestore = `Phase9 Temp Product Updated ${stamp}`;

    // D — Restore product restores old values
    const dRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: saCookie,
      body: { revision_id: revForRestore.id },
    });
    const [prodAfterD] = await q("SELECT name, price FROM products WHERE id=? LIMIT 1", [productId]);
    mark(
      "D",
      dRestore.status === 200 && prodAfterD?.[0]?.name === prodName0,
      `status=${dRestore.status} name=${prodAfterD?.[0]?.name}`
    );

    // E — Restore first saves current as revision_action=restore
    const revE = await latestRevision("product", productId);
    let snapE = null;
    try {
      snapE = JSON.parse(revE?.snapshot_json || "null");
    } catch {
      snapE = null;
    }
    mark(
      "E",
      revE?.revision_action === "restore" && snapE?.name === nameBeforeRestore,
      `action=${revE?.revision_action} snapName=${snapE?.name}`
    );

    // F — After restore, restoring the pre-restore revision undoes
    const fRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: saCookie,
      body: { revision_id: revE.id },
    });
    const [prodAfterF] = await q("SELECT name FROM products WHERE id=? LIMIT 1", [productId]);
    mark(
      "F",
      fRestore.status === 200 && prodAfterF?.[0]?.name === nameBeforeRestore,
      `status=${fRestore.status} name=${prodAfterF?.[0]?.name}`
    );

    // G — Product slug conflict on restore → 409, no data changed
    // Change product slug away from conflictSlug's value path: update product to a new slug,
    // then craft a revision whose snapshot wants conflictSlug (already taken by conflict product).
    const slugBeforeG = `phase9-temp-product-${stamp}-g`;
    await request("PUT", "/api/admin-products", {
      cookie: saCookie,
      body: { id: productId, slug: slugBeforeG },
    });
    const [prodBeforeG] = await q("SELECT name, slug, price FROM products WHERE id=? LIMIT 1", [productId]);
    const beforeG = prodBeforeG[0];
    // Insert a synthetic update revision with snapshot wanting the conflict slug
    const [insG] = await q(
      `INSERT INTO content_revisions
        (entity_type, entity_id, entity_label, revision_action, snapshot_json, changed_fields_json,
         actor_type, actor_staff_id, actor_name, actor_role)
       VALUES ('product', ?, ?, 'update', ?, ?, 'master', NULL, 'Admin', 'super_admin')`,
      [
        String(productId),
        beforeG.name,
        JSON.stringify({
          id: productId,
          name: beforeG.name,
          slug: conflictSlug,
          description: "phase9-desc-v0",
          price: beforeG.price,
          category: "Subscription",
          stock: "Digital",
          active: 1,
          short_description: "phase9-short-v0",
          full_description: "",
          seo_title: "",
          meta_description: "",
          focus_keyword: "",
          features: "",
          og_image: "",
        }),
        JSON.stringify(["slug"]),
      ]
    );
    const gRevId = insG.insertId;
    const gRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: saCookie,
      body: { revision_id: gRevId },
    });
    const [prodAfterG] = await q("SELECT name, slug, price FROM products WHERE id=? LIMIT 1", [productId]);
    const afterG = prodAfterG[0];
    mark(
      "G",
      gRestore.status === 409 &&
        String(afterG.slug) === String(beforeG.slug) &&
        String(afterG.name) === String(beforeG.name),
      `status=${gRestore.status} slug=${afterG.slug}`
    );

    // H — Product delete stores delete snapshot; restore denied (400)
    const delCreate = await request("POST", "/api/admin-products", {
      cookie: saCookie,
      body: {
        name: `Phase9 Temp Delete ${stamp}`,
        slug: `phase9-temp-delete-${stamp}`,
        price: 9,
        category: "Bundle",
        stock: "Digital",
        description: "phase9-to-delete",
      },
    });
    const delId = delCreate.json?.id;
    if (delId) productIds.push(delId);
    const hDel = await request("DELETE", `/api/admin-products?id=${delId}`, { cookie: saCookie });
    const revH = await latestRevision("product", delId);
    let snapH = null;
    try {
      snapH = JSON.parse(revH?.snapshot_json || "null");
    } catch {
      snapH = null;
    }
    const hGet = await request("GET", `/api/admin-revisions?id=${revH?.id}`, { cookie: saCookie });
    const hRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: saCookie,
      body: { revision_id: revH?.id },
    });
    mark(
      "H",
      hDel.status === 200 &&
        revH?.revision_action === "delete" &&
        snapH?.slug === `phase9-temp-delete-${stamp}` &&
        hGet.status === 200 &&
        hRestore.status === 400,
      `del=${hDel.status} action=${revH?.revision_action} get=${hGet.status} restore=${hRestore.status}`
    );

    // --- Blog setup ---
    const blogTitle0 = `Phase9 Temp Blog ${stamp}`;
    const blogSlug0 = `phase9-temp-blog-${stamp}`;
    const createB = await request("POST", "/api/blog", {
      cookie: saCookie,
      body: {
        title: blogTitle0,
        slug: blogSlug0,
        excerpt: "phase9 excerpt v0",
        content: "phase9 content v0",
        category: "Guides",
        status: "published",
      },
    });
    const blogId = createB.json?.id;
    if (!blogId) throw new Error(`blog create failed status=${createB.status}`);
    blogIds.push(blogId);

    // I — Blog update creates revision
    const countBeforeI = await countRevisions("blog", blogId);
    const iUp = await request("PUT", "/api/blog", {
      cookie: saCookie,
      body: { id: blogId, title: `Phase9 Temp Blog Updated ${stamp}` },
    });
    const countAfterI = await countRevisions("blog", blogId);
    const revI = await latestRevision("blog", blogId);
    let snapI = null;
    try {
      snapI = JSON.parse(revI?.snapshot_json || "null");
    } catch {
      snapI = null;
    }
    mark(
      "I",
      iUp.status === 200 &&
        countAfterI === countBeforeI + 1 &&
        revI?.revision_action === "update" &&
        snapI?.title === blogTitle0,
      `status=${iUp.status} delta=${countAfterI - countBeforeI}`
    );

    // J — Blog restore works
    const jRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: saCookie,
      body: { revision_id: revI.id },
    });
    const [blogAfterJ] = await q("SELECT title FROM blog_posts WHERE id=? LIMIT 1", [blogId]);
    mark(
      "J",
      jRestore.status === 200 && blogAfterJ?.[0]?.title === blogTitle0,
      `status=${jRestore.status} title=${blogAfterJ?.[0]?.title}`
    );

    // K — Blog delete snapshot viewable; restore denied
    const blogDelCreate = await request("POST", "/api/blog", {
      cookie: saCookie,
      body: {
        title: `Phase9 Temp Blog Del ${stamp}`,
        slug: `phase9-temp-blog-del-${stamp}`,
        excerpt: "del",
        content: "del",
        category: "Guides",
        status: "published",
      },
    });
    const blogDelId = blogDelCreate.json?.id;
    if (blogDelId) blogIds.push(blogDelId);
    const kDel = await request("DELETE", `/api/blog?id=${blogDelId}`, { cookie: saCookie });
    const revK = await latestRevision("blog", blogDelId);
    const kGet = await request("GET", `/api/admin-revisions?id=${revK?.id}`, { cookie: saCookie });
    const kRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: saCookie,
      body: { revision_id: revK?.id },
    });
    mark(
      "K",
      kDel.status === 200 &&
        revK?.revision_action === "delete" &&
        kGet.status === 200 &&
        !!kGet.json?.snapshot &&
        kRestore.status === 400,
      `del=${kDel.status} get=${kGet.status} restore=${kRestore.status}`
    );

    // L — Site-content batch creates ONE revision with only affected keys
    const keyA = `phase9.temp.key_a_${stamp}`;
    const keyB = `phase9.temp.key_b_${stamp}`;
    const keyC = `phase9.temp.key_c_${stamp}`;
    siteKeys.push(keyA, keyB, keyC);
    // Seed keys first (first write creates rows; may also create revisions)
    await request("POST", "/api/site-content", {
      cookie: saCookie,
      body: {
        updates: [
          { key: keyA, value: "a0" },
          { key: keyB, value: "b0" },
          { key: keyC, value: "c0" },
        ],
      },
    });
    // Multi non-settings keys → entity_type site_content; entity_id is joined keys (≤191)
    const batchEntityId = [keyA, keyB].join(",").slice(0, 191);
    const countBeforeL = await countRevisions("site_content", batchEntityId);
    const lUp = await request("POST", "/api/site-content", {
      cookie: saCookie,
      body: {
        updates: [
          { key: keyA, value: "a1" },
          { key: keyB, value: "b1" },
        ],
      },
    });
    const countAfterL = await countRevisions("site_content", batchEntityId);
    const revL = await latestRevision("site_content", batchEntityId);
    let snapL = null;
    try {
      snapL = JSON.parse(revL?.snapshot_json || "null");
    } catch {
      snapL = null;
    }
    const snapKeysL = snapL?.values ? Object.keys(snapL.values) : [];
    const onlyAffected =
      snapKeysL.length > 0 &&
      snapKeysL.every((k) => k === keyA || k === keyB) &&
      snapKeysL.includes(keyA) &&
      snapKeysL.includes(keyB) &&
      !snapKeysL.includes(keyC);
    mark(
      "L",
      lUp.status === 200 && countAfterL === countBeforeL + 1 && onlyAffected,
      `status=${lUp.status} delta=${countAfterL - countBeforeL} keys=${JSON.stringify(snapKeysL)}`
    );

    // M — Site-content restore works
    const mRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: saCookie,
      body: { revision_id: revL.id },
    });
    const [rowsM] = await q(
      "SELECT content_key, content_value FROM site_content WHERE content_key IN (?,?)",
      [keyA, keyB]
    );
    const mapM = Object.fromEntries((rowsM || []).map((r) => [r.content_key, r.content_value]));
    mark(
      "M",
      mRestore.status === 200 && mapM[keyA] === "a0" && mapM[keyB] === "b0",
      `status=${mRestore.status} a=${mapM[keyA]} b=${mapM[keyB]}`
    );

    // N — Deleted site-content key can be restored
    const keyN = `phase9.temp.key_del_${stamp}`;
    siteKeys.push(keyN);
    await request("POST", "/api/site-content", {
      cookie: saCookie,
      body: { updates: [{ key: keyN, value: "n-alive" }] },
    });
    await request("PUT", "/api/site-content", {
      cookie: saCookie,
      body: {
        content_key: keyN,
        content_value: "n-before-delete",
        content_type: "text",
        page_name: "phase9",
        label: keyN,
      },
    });
    const nDel = await request("DELETE", `/api/site-content?key=${encodeURIComponent(keyN)}`, {
      cookie: saCookie,
    });
    const revN = await latestRevision("site_content", keyN);
    const nRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: saCookie,
      body: { revision_id: revN?.id },
    });
    const [rowsN] = await q(
      "SELECT content_value FROM site_content WHERE content_key=? LIMIT 1",
      [keyN]
    );
    mark(
      "N",
      nDel.status === 200 &&
        revN?.revision_action === "delete" &&
        nRestore.status === 200 &&
        rowsN?.[0]?.content_value != null,
      `del=${nDel.status} restore=${nRestore.status} val=${rowsN?.[0]?.content_value}`
    );

    // O — Subscription routing-key generic restore denied
    const oEntityId = `phase9.temp.sub_route_${stamp}`;
    siteKeys.push(oEntityId);
    const [insO] = await q(
      `INSERT INTO content_revisions
        (entity_type, entity_id, entity_label, revision_action, snapshot_json, changed_fields_json,
         actor_type, actor_staff_id, actor_name, actor_role)
       VALUES ('site_content', ?, ?, 'update', ?, ?, 'master', NULL, 'Admin', 'super_admin')`,
      [
        oEntityId,
        oEntityId,
        JSON.stringify({
          values: { subscription_slug: "phase9-fake-slug" },
          metadata: { rows: {}, keys: ["subscription_slug"] },
        }),
        JSON.stringify(["subscription_slug"]),
      ]
    );
    const oRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: saCookie,
      body: { revision_id: insO.insertId },
    });
    mark("O", oRestore.status === 400, `status=${oRestore.status}`);

    // P — Super Admin may restore site_settings (site_tagline)
    const [tagRows] = await q(
      "SELECT content_value FROM site_content WHERE content_key='site_tagline' LIMIT 1"
    );
    siteTaglineOriginal = tagRows?.[0]?.content_value ?? "";
    const tagTemp1 = `phase9-temp-tagline-1-${stamp}`;
    const tagTemp2 = `phase9-temp-tagline-2-${stamp}`;
    const p1 = await request("POST", "/api/site-content", {
      cookie: saCookie,
      body: { updates: [{ key: "site_tagline", value: tagTemp1 }] },
    });
    const p2 = await request("POST", "/api/site-content", {
      cookie: saCookie,
      body: { updates: [{ key: "site_tagline", value: tagTemp2 }] },
    });
    const revP = await latestRevision("site_settings", "site_tagline");
    const pRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: saCookie,
      body: { revision_id: revP?.id },
    });
    const [tagAfter] = await q(
      "SELECT content_value FROM site_content WHERE content_key='site_tagline' LIMIT 1"
    );
    mark(
      "P",
      p1.status === 200 &&
        p2.status === 200 &&
        revP?.entity_type === "site_settings" &&
        pRestore.status === 200 &&
        tagAfter?.[0]?.content_value === tagTemp1,
      `p1=${p1.status} p2=${p2.status} restore=${pRestore.status} val=${tagAfter?.[0]?.content_value}`
    );

    // Q — Manager cannot view/restore site_settings revisions (403)
    const qList = await request("GET", "/api/admin-revisions?entity_type=site_settings&limit=10", {
      cookie: mgrCookie,
    });
    const qGet = await request("GET", `/api/admin-revisions?id=${revP?.id}`, { cookie: mgrCookie });
    const qRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: mgrCookie,
      body: { revision_id: revP?.id },
    });
    mark(
      "Q",
      qList.status === 403 && qGet.status === 403 && qRestore.status === 403,
      `list=${qList.status} get=${qGet.status} restore=${qRestore.status}`
    );

    // R — Manager can restore product revision
    const [nameBeforeRRows] = await q("SELECT name FROM products WHERE id=? LIMIT 1", [productId]);
    const nameBeforeR = nameBeforeRRows[0]?.name;
    const rUp = await request("PUT", "/api/admin-products", {
      cookie: saCookie,
      body: { id: productId, name: `Phase9 Mgr Restore Target ${stamp}` },
    });
    const revR = await latestRevision("product", productId);
    const rRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: mgrCookie,
      body: { revision_id: revR.id },
    });
    const [prodAfterR] = await q("SELECT name FROM products WHERE id=? LIMIT 1", [productId]);
    mark(
      "R",
      rUp.status === 200 &&
        rRestore.status === 200 &&
        prodAfterR?.[0]?.name === nameBeforeR,
      `up=${rUp.status} restore=${rRestore.status} name=${prodAfterR?.[0]?.name}`
    );

    // S — Writer list only blog types
    const sList = await request("GET", "/api/admin-revisions?page=1&limit=25", { cookie: wrCookie });
    const sAllowed = sList.json?.meta?.allowedEntityTypes || [];
    const sBad = (sList.json?.items || []).some((i) => i.entity_type !== "blog");
    mark(
      "S",
      sList.status === 200 &&
        Array.isArray(sAllowed) &&
        sAllowed.length === 1 &&
        sAllowed[0] === "blog" &&
        !sBad,
      `status=${sList.status} allowed=${JSON.stringify(sAllowed)} bad=${sBad}`
    );

    // T — Writer GET product revision by id → 403
    const tGet = await request("GET", `/api/admin-revisions?id=${revR.id}`, { cookie: wrCookie });
    mark("T", tGet.status === 403, `status=${tGet.status}`);

    // U — No cookie → 401
    const uList = await request("GET", "/api/admin-revisions?page=1&limit=10");
    mark("U", uList.status === 401, `status=${uList.status}`);

    // V — Unauthorized entity restore → 403 (writer restore product)
    const vRestore = await request("POST", "/api/admin-revisions/restore", {
      cookie: wrCookie,
      body: { revision_id: revR.id },
    });
    mark("V", vRestore.status === 403, `status=${vRestore.status}`);

    // W — Pagination works
    const w1 = await request("GET", "/api/admin-revisions?page=1&limit=10", { cookie: saCookie });
    const w2 = await request("GET", "/api/admin-revisions?page=2&limit=10", { cookie: saCookie });
    mark(
      "W",
      w1.status === 200 &&
        w2.status === 200 &&
        w1.json?.pagination?.limit === 10 &&
        Number(w1.json?.pagination?.totalPages) >= 1 &&
        Array.isArray(w1.json?.items),
      `p1=${w1.status} p2=${w2.status} total=${w1.json?.pagination?.total}`
    );

    // X — List API items must NOT include snapshot_json
    const xItems = w1.json?.items || [];
    const xHasSnap = xItems.some(
      (i) =>
        Object.prototype.hasOwnProperty.call(i, "snapshot_json") ||
        Object.prototype.hasOwnProperty.call(i, "snapshot")
    );
    mark("X", xItems.length >= 0 && !xHasSnap, `n=${xItems.length} hasSnap=${xHasSnap}`);

    // Y — One revision.restored audit event (for the manager product restore R)
    const [yRows] = await q(
      `SELECT COUNT(*) AS c FROM admin_audit_log
       WHERE action='revision.restored' AND entity_type='product' AND entity_id=?
         AND summary LIKE ?`,
      [String(productId), `%revision ${revR.id}%`]
    );
    mark("Y", Number(yRows[0].c) === 1, `count=${yRows[0].c}`);

    // Z — Audit metadata has no full content/secrets
    const [zRows] = await q(
      `SELECT metadata_json, summary FROM admin_audit_log
       WHERE action='revision.restored' AND entity_id=?
       ORDER BY id DESC LIMIT 5`,
      [String(productId)]
    );
    const zBlob = JSON.stringify(zRows || []);
    const zBad =
      /password_hash|"password"\s*:|session_token|snapshot_json|"snapshot"\s*:|phase9-desc-v0|phase9 content v0/i.test(
        zBlob
      );
    let zMetaOk = true;
    for (const row of zRows || []) {
      try {
        const meta = JSON.parse(row.metadata_json || "{}");
        if (meta.snapshot || meta.snapshot_json || meta.password || meta.password_hash) zMetaOk = false;
        if (meta.changed_fields && !Array.isArray(meta.changed_fields)) zMetaOk = false;
      } catch {
        zMetaOk = false;
      }
    }
    mark("Z", !zBad && zMetaOk, `badSecrets=${zBad} metaOk=${zMetaOk}`);

    // AA — Retention: 105 SQL rows then one API update → count <= 100
    const retainCreate = await request("POST", "/api/admin-products", {
      cookie: saCookie,
      body: {
        name: `Phase9 Temp Retain ${stamp}`,
        slug: `phase9-temp-retain-${stamp}`,
        price: 5,
        category: "Subscription",
        stock: "Digital",
        description: "phase9-retain",
      },
    });
    const retainId = retainCreate.json?.id;
    if (retainId) productIds.push(retainId);
    for (let i = 0; i < 105; i++) {
      await q(
        `INSERT INTO content_revisions
          (entity_type, entity_id, entity_label, revision_action, snapshot_json, changed_fields_json,
           actor_type, actor_staff_id, actor_name, actor_role)
         VALUES ('product', ?, ?, 'update', ?, ?, 'master', NULL, 'Admin', 'super_admin')`,
        [
          String(retainId),
          `Phase9 Temp Retain ${stamp}`,
          JSON.stringify({
            id: retainId,
            name: `Phase9 Temp Retain ${stamp}`,
            slug: `phase9-temp-retain-${stamp}`,
            price: 5,
            category: "Subscription",
            description: `pad-${i}`,
            stock: "Digital",
            active: 1,
          }),
          JSON.stringify(["description"]),
        ]
      );
    }
    const aaUp = await request("PUT", "/api/admin-products", {
      cookie: saCookie,
      body: { id: retainId, price: 6 },
    });
    const aaCount = await countRevisions("product", retainId);
    mark(
      "AA",
      aaUp.status === 200 && aaCount <= 100,
      `status=${aaUp.status} count=${aaCount}`
    );

    // BB — Runtime DDL check
    const bb = spawnSync(process.execPath, [path.join(process.cwd(), "scripts", "check-runtime-ddl.js")], {
      encoding: "utf8",
      cwd: process.cwd(),
    });
    const bbOut = `${bb.stdout || ""}\n${bb.stderr || ""}`;
    mark("BB", bb.status === 0 && /\bPASS\b/.test(bbOut), `exit=${bb.status}`);
  } catch (err) {
    console.error("TEST ERROR:", err?.message || err);
    for (const id of [
      "A",
      "B",
      "C",
      "D",
      "E",
      "F",
      "G",
      "H",
      "I",
      "J",
      "K",
      "L",
      "M",
      "N",
      "O",
      "P",
      "Q",
      "R",
      "S",
      "T",
      "U",
      "V",
      "W",
      "X",
      "Y",
      "Z",
      "AA",
      "BB",
    ]) {
      if (!out[id]) mark(id, false, "aborted before test");
    }
  } finally {
    try {
      // Restore site_tagline if we changed it
      if (siteTaglineOriginal != null && saCookie) {
        await request("POST", "/api/site-content", {
          cookie: saCookie,
          body: { updates: [{ key: "site_tagline", value: siteTaglineOriginal }] },
        }).catch(() => {});
      }

      if (productIds.length) {
        for (const id of productIds) {
          await q("DELETE FROM products WHERE id=?", [id]).catch(() => {});
          await q("DELETE FROM content_revisions WHERE entity_type='product' AND entity_id=?", [
            String(id),
          ]).catch(() => {});
          await q(
            "DELETE FROM admin_audit_log WHERE entity_type IN ('product') AND entity_id=?",
            [String(id)]
          ).catch(() => {});
        }
      }
      await q(
        "DELETE FROM products WHERE slug LIKE 'phase9-temp-%' OR name LIKE 'Phase9 Temp %'"
      ).catch(() => {});

      if (blogIds.length) {
        for (const id of blogIds) {
          await q("DELETE FROM blog_posts WHERE id=?", [id]).catch(() => {});
          await q("DELETE FROM content_revisions WHERE entity_type='blog' AND entity_id=?", [
            String(id),
          ]).catch(() => {});
          await q("DELETE FROM admin_audit_log WHERE entity_type='blog' AND entity_id=?", [
            String(id),
          ]).catch(() => {});
        }
      }
      await q(
        "DELETE FROM blog_posts WHERE slug LIKE 'phase9-temp-%' OR title LIKE 'Phase9 Temp %'"
      ).catch(() => {});

      // site_content temp keys
      await q(
        "DELETE FROM site_content WHERE content_key LIKE 'phase9.temp.%' OR content_key LIKE 'phase9_temp_%' OR content_key LIKE 'phase9-temp-%'"
      ).catch(() => {});
      await q(
        `DELETE FROM content_revisions
         WHERE entity_id LIKE 'phase9.temp.%'
            OR entity_id LIKE 'phase9_temp_%'
            OR entity_id LIKE 'phase9-temp-%'
            OR entity_id LIKE 'phase9.temp.%'`
      ).catch(() => {});
      await q(
        `DELETE FROM content_revisions
         WHERE entity_type IN ('site_content','site_content_batch','site_settings')
           AND (entity_id LIKE '%phase9.temp.%' OR entity_label LIKE '%phase9.temp.%' OR snapshot_json LIKE '%phase9.temp.%')`
      ).catch(() => {});
      // Clean synthetic O revision + tagline test revisions that reference our temps
      await q(
        `DELETE FROM content_revisions
         WHERE entity_type='site_settings' AND entity_id='site_tagline'
           AND (snapshot_json LIKE '%phase9-temp-tagline%' OR changed_fields_json LIKE '%site_tagline%')
           AND created_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)`
      ).catch(() => {});
      await q(
        `DELETE FROM admin_audit_log
         WHERE action='revision.restored'
           AND created_at > DATE_SUB(NOW(), INTERVAL 2 HOUR)
           AND (summary LIKE '%phase9%' OR entity_id LIKE 'phase9%' OR metadata_json LIKE '%phase9%')`
      ).catch(() => {});

      if (sessionTokenHashes.length) {
        await q(
          `DELETE FROM admin_sessions WHERE token_hash IN (${sessionTokenHashes.map(() => "?").join(",")})`,
          sessionTokenHashes
        ).catch(() => {});
      }
    } catch (cleanupErr) {
      console.warn("cleanup warning:", cleanupErr?.message || cleanupErr);
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
